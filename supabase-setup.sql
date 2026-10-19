-- Supabase Schema for Chess-AI
-- Tables: public.users (email, name, password) & public.profiles

-- 1. Create public.users table (email, name, password)
create table if not exists public.users (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null default '',
    email text not null unique,
    password text not null default '',
    created_at timestamptz not null default now()
);

-- 2. Create public.profiles table
create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    full_name text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- 3. Enable Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.profiles enable row level security;

-- 4. RLS Policies
drop policy if exists "Allow authenticated read users" on public.users;
create policy "Allow authenticated read users"
    on public.users for select to authenticated using (true);

drop policy if exists "Allow anon check users" on public.users;
create policy "Allow anon check users"
    on public.users for select to anon using (true);

drop policy if exists "Users can read profiles" on public.profiles;
create policy "Users can read profiles"
    on public.profiles for select to authenticated using (true);

-- 5. Grant Permissions
grant select on public.users to anon, authenticated;
grant select on public.profiles to anon, authenticated;

-- 6. RPC Function to check if an email is already registered (prevents duplicate emails)
create or replace function public.check_email_exists(email_to_check text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
    return exists (
        select 1 from auth.users where lower(email) = lower(trim(email_to_check))
    );
end;
$$;

grant execute on function public.check_email_exists(text) to anon, authenticated;

-- 7. Trigger: Automatically confirm new user's email so they can log in immediately
create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
    new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
    return new;
end;
$$;

drop trigger if exists on_auth_user_created_autoconfirm on auth.users;
create trigger on_auth_user_created_autoconfirm
    before insert on auth.users
    for each row
    execute function public.auto_confirm_new_user();

-- 8. Trigger: Sync auth.users into public.users and public.profiles
create or replace function public.sync_auth_user_to_public()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.users (id, name, email, password)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
        new.email,
        coalesce(new.raw_user_meta_data->>'password_display', '••••••••')
    )
    on conflict (id) do update set
        name = excluded.name,
        email = excluded.email,
        password = excluded.password;

    insert into public.profiles (id, full_name)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', '')
    )
    on conflict (id) do update set
        full_name = excluded.full_name;

    return new;
end;
$$;

drop trigger if exists on_auth_user_sync on auth.users;
create trigger on_auth_user_sync
    after insert or update on auth.users
    for each row
    execute function public.sync_auth_user_to_public();
