const supabaseClient = window.supabase.createClient(
    'https://ejohrqrnhtdtntxdgihx.supabase.co',
    'sb_publishable_Q7yyXVs5-SXYjn0PyD1QTw_AM8IEDGi'
);

supabaseClient.auth.onAuthStateChange(event => {
    if (event === 'PASSWORD_RECOVERY') {
        document.getElementById('updatePasswordOverlay').classList.add('open');
        setTimeout(() => document.getElementById('newPassword').focus(), 100);
    }
});

/* ═══════════════════════════════════════════
   CHESSBOARD BACKGROUND
═══════════════════════════════════════════ */
const boardBg = document.getElementById('boardBg');
if (boardBg) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const s = document.createElement('span');
            s.className = 'sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
            boardBg.appendChild(s);
        }
    }
}

/* ═══════════════════════════════════════════
   TAB SWITCHING
═══════════════════════════════════════════ */
function switchTab(mode, preserveValues = false) {
    const isSignIn = mode === 'signin';
    document.getElementById('tabSignIn').classList.toggle('active', isSignIn);
    document.getElementById('tabSignUp').classList.toggle('active', !isSignIn);
    document.getElementById('tabSignIn').setAttribute('aria-selected', isSignIn);
    document.getElementById('tabSignUp').setAttribute('aria-selected', !isSignIn);
    document.getElementById('viewSignIn').classList.toggle('active', isSignIn);
    document.getElementById('viewSignUp').classList.toggle('active', !isSignIn);
    clearErrors();
    if (!preserveValues) {
        clearFormInputs();
    }
}

function clearFormInputs() {
    // Reset Sign In inputs
    const siEmail = document.getElementById('siEmail');
    if (siEmail) siEmail.value = '';

    const siPassword = document.getElementById('siPassword');
    if (siPassword) {
        siPassword.value = '';
        siPassword.type = 'password';
    }
    const siEye = document.getElementById('siEye');
    if (siEye) siEye.innerHTML = eyeOnSVG;
    const siEyeBtn = document.getElementById('siEyeBtn');
    if (siEyeBtn) siEyeBtn.setAttribute('aria-label', 'Show password');

    const rememberMe = document.getElementById('rememberMe');
    if (rememberMe) rememberMe.checked = false;

    // Reset Sign Up inputs
    const suName = document.getElementById('suName');
    if (suName) suName.value = '';

    const suEmail = document.getElementById('suEmail');
    if (suEmail) suEmail.value = '';

    const suPassword = document.getElementById('suPassword');
    if (suPassword) {
        suPassword.value = '';
        suPassword.type = 'password';
    }
    const suEye = document.getElementById('suEye');
    if (suEye) suEye.innerHTML = eyeOnSVG;
    const suEyeBtn = document.getElementById('suEyeBtn');
    if (suEyeBtn) suEyeBtn.setAttribute('aria-label', 'Show password');

    const suConfirm = document.getElementById('suConfirm');
    if (suConfirm) {
        suConfirm.value = '';
        suConfirm.type = 'password';
    }
    const suConfirmEye = document.getElementById('suConfirmEye');
    if (suConfirmEye) suConfirmEye.innerHTML = eyeOnSVG;
    const suConfirmEyeBtn = document.getElementById('suConfirmEyeBtn');
    if (suConfirmEyeBtn) suConfirmEyeBtn.setAttribute('aria-label', 'Show confirm password');

    // Reset password strength bar
    updateStrength('');
}

function clearErrors() {
    document.querySelectorAll('.field-msg').forEach(el => {
        el.className = 'field-msg';
        el.textContent = '';
    });
    document.querySelectorAll('.field input').forEach(el => {
        el.classList.remove('is-error', 'is-success');
    });
    const strengthWrap = document.getElementById('strengthWrap');
    if (strengthWrap) strengthWrap.classList.remove('visible');
}

/* ═══════════════════════════════════════════
   EYE TOGGLE (SHOW / HIDE PASSWORD)
═══════════════════════════════════════════ */
const eyeOnSVG = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
const eyeOffSVG = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`;

function toggleEye(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!input || !icon) return;
    const btn = icon.closest('button');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    icon.innerHTML = isHidden ? eyeOffSVG : eyeOnSVG;
    if (btn) btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
}

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function setMsg(id, text, type) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'field-msg ' + (type || '');
}

function setFieldState(inputId, state) {
    const el = document.getElementById(inputId);
    if (!el) return;
    el.classList.remove('is-error', 'is-success');
    if (state) el.classList.add(state);
}

function isValidEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
let toastTimer;

function showToast(msg, type = 'info', duration = 3500) {
    const t = document.getElementById('toast');
    if (!t) return;

    if (type === 'success') {
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 20 20');
        icon.setAttribute('aria-hidden', 'true');
        icon.classList.add('toast-icon');

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '10');
        circle.setAttribute('cy', '10');
        circle.setAttribute('r', '9');
        circle.setAttribute('fill', 'currentColor');
        circle.setAttribute('opacity', '0.2');

        const check = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        check.setAttribute('d', 'm5.5 10 3 3 6-6');
        check.setAttribute('fill', 'none');
        check.setAttribute('stroke', 'currentColor');
        check.setAttribute('stroke-width', '2');
        check.setAttribute('stroke-linecap', 'round');
        check.setAttribute('stroke-linejoin', 'round');

        icon.append(circle, check);
        t.replaceChildren(icon, document.createTextNode(msg));
    } else {
        t.textContent = msg;
    }

    t.className = 'toast toast-' + type + ' show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), duration);
}

/* ═══════════════════════════════════════════
   PASSWORD STRENGTH INDICATOR
═══════════════════════════════════════════ */
function calcStrength(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { level: 1, label: 'Weak', cls: 'filled-weak' };
    if (score === 2) return { level: 2, label: 'Fair', cls: 'filled-fair' };
    if (score === 3) return { level: 3, label: 'Good', cls: 'filled-good' };
    return { level: 4, label: 'Strong', cls: 'filled-strong' };
}

function updateStrength(pw) {
    const wrap = document.getElementById('strengthWrap');
    if (!wrap) return;
    if (!pw) { wrap.classList.remove('visible'); return; }
    wrap.classList.add('visible');
    const { level, label, cls } = calcStrength(pw);
    for (let i = 1; i <= 4; i++) {
        const bar = document.getElementById('sb' + i);
        if (bar) bar.className = 'strength-bar' + (i <= level ? ' ' + cls : '');
    }
    const labelEl = document.getElementById('strengthLabel');
    if (labelEl) labelEl.textContent = label;
}

/* ═══════════════════════════════════════════
   SIGN UP — LIVE VALIDATION
═══════════════════════════════════════════ */
function onSuPasswordInput() {
    const pw = document.getElementById('suPassword').value;
    updateStrength(pw);
    if (document.getElementById('suConfirm').value) {
        onSuConfirmInput();
    }
}

function onSuConfirmInput() {
    const pw = document.getElementById('suPassword').value;
    const cfw = document.getElementById('suConfirm').value;
    if (!cfw) {
        setMsg('suConfirmMsg', '', '');
        setFieldState('suConfirm', null);
        return;
    }
    if (pw === cfw) {
        setMsg('suConfirmMsg', 'Passwords match.', 'success');
        setFieldState('suConfirm', 'is-success');
    } else {
        setMsg('suConfirmMsg', 'Passwords do not match.', 'error');
        setFieldState('suConfirm', 'is-error');
    }
}

// Live email duplicate check on blur
const suEmailInput = document.getElementById('suEmail');
if (suEmailInput) {
    suEmailInput.addEventListener('blur', async () => {
        const email = suEmailInput.value.trim();
        if (isValidEmail(email)) {
            try {
                const { data: exists } = await supabaseClient.rpc('check_email_exists', {
                    email_to_check: email
                });
                if (exists) {
                    setMsg('suEmailMsg', 'Email is already registered. Please use another email.', 'error');
                    setFieldState('suEmail', 'is-error');
                } else if (suEmailInput.classList.contains('is-error')) {
                    setMsg('suEmailMsg', '', '');
                    setFieldState('suEmail', null);
                }
            } catch (_) { }
        }
    });
}

/* ═══════════════════════════════════════════
   SIGN IN — SUBMIT
═══════════════════════════════════════════ */
async function handleSignIn() {
    const emailEl = document.getElementById('siEmail');
    const passEl = document.getElementById('siPassword');
    const btn = document.getElementById('btnSignIn');
    let valid = true;

    setMsg('siEmailMsg', '', ''); setFieldState('siEmail', null);
    setMsg('siPasswordMsg', '', ''); setFieldState('siPassword', null);

    if (!isValidEmail(emailEl.value)) {
        setMsg('siEmailMsg', 'Enter a valid email address.', 'error');
        setFieldState('siEmail', 'is-error');
        valid = false;
    }

    if (!passEl.value) {
        setMsg('siPasswordMsg', 'Password is required.', 'error');
        setFieldState('siPassword', 'is-error');
        valid = false;
    }

    if (!valid) return;

    btn.classList.add('loading');
    btn.disabled = true;

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: emailEl.value.trim(),
            password: passEl.value
        });

        if (error) {
            showToast(error.message, 'error', 5000);
            return;
        }

        // Display "Successful" and connect login to chessdashboard.html
        showToast('Successful!', 'success', 2500);
        setTimeout(() => {
            window.location.href = '../chessdashboard/chessdashboard.html';
        }, 800);
    } catch (error) {
        console.error('Supabase sign-in failed:', error);
        showToast('Unable to sign in. Check your connection and try again.', 'error', 5000);
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

/* ═══════════════════════════════════════════
   SIGN UP — SUBMIT
═══════════════════════════════════════════ */
async function handleSignUp() {
    const nameEl = document.getElementById('suName');
    const emailEl = document.getElementById('suEmail');
    const passEl = document.getElementById('suPassword');
    const confirmEl = document.getElementById('suConfirm');
    const btn = document.getElementById('btnSignUp');
    let valid = true;

    ['suNameMsg', 'suEmailMsg', 'suPasswordMsg', 'suConfirmMsg'].forEach(id => setMsg(id, '', ''));
    ['suName', 'suEmail', 'suPassword', 'suConfirm'].forEach(id => setFieldState(id, null));

    if (!nameEl.value.trim() || nameEl.value.trim().length < 2) {
        setMsg('suNameMsg', 'Enter your full name.', 'error');
        setFieldState('suName', 'is-error');
        valid = false;
    }

    const email = emailEl.value.trim();
    if (!isValidEmail(email)) {
        setMsg('suEmailMsg', 'Enter a valid email address.', 'error');
        setFieldState('suEmail', 'is-error');
        valid = false;
    }

    if (passEl.value.length < 8) {
        setMsg('suPasswordMsg', 'Password must be at least 8 characters long.', 'error');
        setFieldState('suPassword', 'is-error');
        valid = false;
    }

    if (passEl.value !== confirmEl.value || !confirmEl.value) {
        setMsg('suConfirmMsg', 'Passwords do not match.', 'error');
        setFieldState('suConfirm', 'is-error');
        valid = false;
    }

    if (!valid) return;

    btn.classList.add('loading');
    btn.disabled = true;

    // Check if email is already registered (check if repeated)
    try {
        const { data: emailExists, error: rpcErr } = await supabaseClient.rpc('check_email_exists', {
            email_to_check: email
        });

        if (!rpcErr && emailExists) {
            setMsg('suEmailMsg', 'Email is already registered. Please log in.', 'error');
            setFieldState('suEmail', 'is-error');
            showToast('Email is already registered. Please log in.', 'error', 5000);
            btn.classList.remove('loading');
            btn.disabled = false;
            return;
        }
    } catch (checkErr) {
        console.warn('Email check error:', checkErr);
    }

    try {
        const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: passEl.value,
            options: {
                data: {
                    full_name: nameEl.value.trim(),
                    password_display: passEl.value
                }
            }
        });

        if (error) {
            if (error.message.toLowerCase().includes('already registered')) {
                setMsg('suEmailMsg', 'Email is already registered. Please log in.', 'error');
                setFieldState('suEmail', 'is-error');
            }
            showToast(error.message, 'error', 5000);
            return;
        }

        // Display "Successful" as requested
        showToast('Successful! Account created.', 'success', 4000);

        // Pre-fill email in Sign In tab
        document.getElementById('siEmail').value = email;

        // Clear Sign Up fields
        nameEl.value = '';
        emailEl.value = '';
        passEl.value = '';
        confirmEl.value = '';
        updateStrength('');

        // Switch to Sign In tab after short delay so user sees "Successful"
        setTimeout(() => {
            switchTab('signin', true);
            document.getElementById('siEmail').value = email;
            const siPasswordEl = document.getElementById('siPassword');
            if (siPasswordEl) siPasswordEl.focus();
        }, 1200);
    } catch (error) {
        console.error('Supabase sign-up failed:', error);
        showToast('Unable to create your account. Check your connection and try again.', 'error', 5000);
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

/* ═══════════════════════════════════════════
   FORGOT PASSWORD MODAL
═══════════════════════════════════════════ */
function openForgot(e) {
    if (e) e.preventDefault();
    document.getElementById('forgotOverlay').classList.add('open');
    setTimeout(() => document.getElementById('forgotEmail').focus(), 100);
}

function closeForgot() {
    document.getElementById('forgotOverlay').classList.remove('open');
    document.getElementById('forgotEmail').value = '';
    setMsg('forgotEmailMsg', '', '');
    setFieldState('forgotEmail', null);
}

async function handleForgot() {
    const emailEl = document.getElementById('forgotEmail');
    setMsg('forgotEmailMsg', '', '');
    setFieldState('forgotEmail', null);

    if (!isValidEmail(emailEl.value)) {
        setMsg('forgotEmailMsg', 'Enter a valid email address.', 'error');
        setFieldState('forgotEmail', 'is-error');
        return;
    }

    const btn = document.querySelector('#forgotOverlay .btn-primary-sm');
    if (btn) btn.disabled = true;

    try {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(emailEl.value.trim(), {
            redirectTo: window.location.href
        });

        if (error) {
            setMsg('forgotEmailMsg', error.message, 'error');
            setFieldState('forgotEmail', 'is-error');
            return;
        }

        closeForgot();
        showToast('If an account exists for that email, a password reset link has been sent.', 'success', 5000);
    } catch (error) {
        console.error('Supabase password reset request failed:', error);
        setMsg('forgotEmailMsg', 'Unable to send the reset email. Check your connection and try again.', 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function handleUpdatePassword() {
    const passwordEl = document.getElementById('newPassword');
    const confirmEl = document.getElementById('confirmNewPassword');
    const btn = document.getElementById('updatePasswordBtn');
    setMsg('newPasswordMsg', '', '');
    setMsg('confirmNewPasswordMsg', '', '');
    setFieldState('newPassword', null);
    setFieldState('confirmNewPassword', null);

    if (passwordEl.value.length < 8) {
        setMsg('newPasswordMsg', 'Password must be at least 8 characters long.', 'error');
        setFieldState('newPassword', 'is-error');
        return;
    }

    if (passwordEl.value !== confirmEl.value) {
        setMsg('confirmNewPasswordMsg', 'Passwords do not match.', 'error');
        setFieldState('confirmNewPassword', 'is-error');
        return;
    }

    if (btn) btn.disabled = true;
    try {
        const { error } = await supabaseClient.auth.updateUser({ password: passwordEl.value });
        if (error) {
            showToast(error.message, 'error', 5000);
            return;
        }

        document.getElementById('updatePasswordOverlay').classList.remove('open');
        passwordEl.value = '';
        confirmEl.value = '';
        showToast('Password updated. You can now sign in with your new password.', 'success', 5000);
    } catch (error) {
        console.error('Supabase password update failed:', error);
        showToast('Unable to update your password. Check your connection and try again.', 'error', 5000);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Close modal when clicking the backdrop
const forgotOverlay = document.getElementById('forgotOverlay');
if (forgotOverlay) {
    forgotOverlay.addEventListener('click', function (e) {
        if (e.target === this) closeForgot();
    });
}

/* ═══════════════════════════════════════════
   QUOTE SLIDESHOW
═══════════════════════════════════════════ */
const CHESS_QUOTES = [
    { text: 'Chess is life in miniature. Chess is struggle, chess is battles.', author: 'Garry Kasparov', role: 'World Chess Champion' },
    { text: 'Perfectly correct chess exists only in theory.', author: 'Garry Kasparov', role: 'World Chess Champion' },
    { text: 'One does not succeed by sticking to convention.', author: 'Garry Kasparov', role: 'World Chess Champion' },
    { text: 'Chess is a fairy tale of 1,001 blunders.', author: 'Savielly Tartakower', role: 'Grandmaster' },
    { text: 'When you see a good move, look for a better one.', author: 'Emanuel Lasker', role: 'World Chess Champion' },
    { text: 'A good player is always lucky.', author: 'José Raúl Capablanca', role: 'World Chess Champion' },
    { text: 'There are two kinds of sacrifices: sound ones and mine.', author: 'Mikhail Tal', role: 'World Chess Champion' },
    { text: 'Chess is everything: art, science, and sport.', author: 'Anatoly Karpov', role: 'World Chess Champion' },
    { text: 'Chess is war over the board.', author: 'Bobby Fischer', role: 'World Chess Champion' },
    { text: 'The pawns are the soul of chess.', author: 'François-André Philidor', role: 'Chess Master' }
];

const QUOTE_INTERVAL_MS = 5000;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initQuoteSlideshow() {
    const wrap = document.getElementById('heroQuoteWrap');
    const quoteEl = document.getElementById('heroQuote');
    const textEl = document.getElementById('heroQuoteText');
    const authorEl = document.getElementById('heroQuoteAuthor');
    const dotsEl = document.getElementById('quoteDots');
    if (!wrap || !quoteEl || !textEl || !authorEl || !dotsEl) return;

    let index = Math.floor(Math.random() * CHESS_QUOTES.length);
    let advanceTimer = null;
    let swapTimer = null;

    function render(i, animate = true) {
        index = (i + CHESS_QUOTES.length) % CHESS_QUOTES.length;
        const q = CHESS_QUOTES[index];

        dotsEl.querySelectorAll('.quote-dot').forEach((dot, n) => {
            dot.classList.toggle('active', n === index);
            dot.setAttribute('aria-current', n === index ? 'true' : 'false');
        });

        const apply = () => {
            textEl.textContent = `“${q.text}”`;
            authorEl.textContent = `— ${q.author}, ${q.role}`;
            quoteEl.classList.remove('is-changing');
        };

        clearTimeout(swapTimer);
        if (!animate || prefersReducedMotion) {
            apply();
            return;
        }
        quoteEl.classList.add('is-changing');
        swapTimer = setTimeout(apply, 300);
    }

    function stop() {
        if (advanceTimer) {
            clearInterval(advanceTimer);
            advanceTimer = null;
        }
    }

    function start() {
        stop();
        if (document.hidden) return;
        advanceTimer = setInterval(() => render(index + 1), QUOTE_INTERVAL_MS);
    }

    CHESS_QUOTES.forEach((_, n) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'quote-dot';
        dot.setAttribute('aria-label', `Show quote ${n + 1} of ${CHESS_QUOTES.length}`);
        dot.addEventListener('click', () => {
            render(n);
            start();
        });
        dotsEl.appendChild(dot);
    });

    wrap.addEventListener('mouseenter', stop);
    wrap.addEventListener('mouseleave', start);
    wrap.addEventListener('focusin', stop);
    wrap.addEventListener('focusout', start);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop();
        else start();
    });

    render(index, false);
    start();
}

initQuoteSlideshow();

/* ═══════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════ */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeForgot();
    }
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
        const updateOverlay = document.getElementById('updatePasswordOverlay');
        const forgotOverlay = document.getElementById('forgotOverlay');
        const viewSignIn = document.getElementById('viewSignIn');

        if (updateOverlay && updateOverlay.classList.contains('open')) {
            handleUpdatePassword();
        } else if (forgotOverlay && forgotOverlay.classList.contains('open')) {
            handleForgot();
        } else if (viewSignIn && viewSignIn.classList.contains('active')) {
            handleSignIn();
        } else {
            handleSignUp();
        }
    }
});