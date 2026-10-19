# Chess-AI

## Supabase setup

1. Open the Supabase project and go to **SQL Editor**.
2. Run the contents of [`supabase-setup.sql`](./supabase-setup.sql) to create the protected `public.profiles` table and the trigger that adds a profile when a user registers.
3. In **Authentication → URL Configuration**, add the URL where `chessai.html` will be hosted to the allowed redirect URLs so password reset emails can return to the app.
4. Open `chessai.html` through a local web server or your hosting provider. Sign-up, sign-in, and forgot-password requests are handled by Supabase Auth.

The browser uses the Supabase publishable key. Never put a secret/service-role key in frontend code.
