/* ═══════════════════════════════════════════
   CHESSBOARD BACKGROUND
═══════════════════════════════════════════ */
const boardBg = document.getElementById('boardBg');
for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
        const s = document.createElement('span');
        s.className = 'sq ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        boardBg.appendChild(s);
    }
}

/* ═══════════════════════════════════════════
   TAB SWITCHING
═══════════════════════════════════════════ */
function switchTab(mode) {
    const isSignIn = mode === 'signin';
    document.getElementById('tabSignIn').classList.toggle('active', isSignIn);
    document.getElementById('tabSignUp').classList.toggle('active', !isSignIn);
    document.getElementById('tabSignIn').setAttribute('aria-selected', isSignIn);
    document.getElementById('tabSignUp').setAttribute('aria-selected', !isSignIn);
    document.getElementById('viewSignIn').classList.toggle('active', isSignIn);
    document.getElementById('viewSignUp').classList.toggle('active', !isSignIn);
    clearErrors();
}

function clearErrors() {
    document.querySelectorAll('.field-msg').forEach(el => {
        el.className = 'field-msg';
        el.textContent = '';
    });
    document.querySelectorAll('.field input').forEach(el => {
        el.classList.remove('is-error', 'is-success');
    });
    document.getElementById('strengthWrap').classList.remove('visible');
}

/* ═══════════════════════════════════════════
   EYE TOGGLE (SHOW / HIDE PASSWORD)
═══════════════════════════════════════════ */
const eyeOnSVG = `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
const eyeOffSVG = `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`;

function toggleEye(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    const btn = icon.closest('button');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    icon.innerHTML = isHidden ? eyeOffSVG : eyeOnSVG;
    btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
}

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function setMsg(id, text, type) {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = 'field-msg ' + type;
}

function setFieldState(inputId, state) {
    const el = document.getElementById(inputId);
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

function showToast(msg, type = 'info', duration = 3000) {
    const t = document.getElementById('toast');
    t.textContent = msg;
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
    if (!pw) { wrap.classList.remove('visible'); return; }
    wrap.classList.add('visible');
    const { level, label, cls } = calcStrength(pw);
    for (let i = 1; i <= 4; i++) {
        const bar = document.getElementById('sb' + i);
        bar.className = 'strength-bar' + (i <= level ? ' ' + cls : '');
    }
    document.getElementById('strengthLabel').textContent = label;
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

/* ═══════════════════════════════════════════
   SIGN IN — SUBMIT
═══════════════════════════════════════════ */
function handleSignIn() {
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

    // Demo: replace with real auth call
    setTimeout(() => {
        btn.classList.remove('loading');
        btn.disabled = false;
        showToast('Demo mode — connect a backend to authenticate.', 'info', 4000);
    }, 1500);
}

/* ═══════════════════════════════════════════
   SIGN UP — SUBMIT
═══════════════════════════════════════════ */
function handleSignUp() {
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

    if (!isValidEmail(emailEl.value)) {
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

    // Demo: replace with real account creation call
    setTimeout(() => {
        btn.classList.remove('loading');
        btn.disabled = false;
        showToast('Demo mode — connect a backend to create an account.', 'info', 4000);
    }, 1500);
}

/* ═══════════════════════════════════════════
   FORGOT PASSWORD MODAL
═══════════════════════════════════════════ */
function openForgot(e) {
    e.preventDefault();
    document.getElementById('forgotOverlay').classList.add('open');
    setTimeout(() => document.getElementById('forgotEmail').focus(), 100);
}

function closeForgot() {
    document.getElementById('forgotOverlay').classList.remove('open');
    document.getElementById('forgotEmail').value = '';
    setMsg('forgotEmailMsg', '', '');
    setFieldState('forgotEmail', null);
}

function handleForgot() {
    const emailEl = document.getElementById('forgotEmail');
    setMsg('forgotEmailMsg', '', '');
    setFieldState('forgotEmail', null);

    if (!isValidEmail(emailEl.value)) {
        setMsg('forgotEmailMsg', 'Enter a valid email address.', 'error');
        setFieldState('forgotEmail', 'is-error');
        return;
    }

    closeForgot();
    showToast('Demo mode — a real reset email would be sent here.', 'info', 4000);
}

// Close modal when clicking the backdrop
document.getElementById('forgotOverlay').addEventListener('click', function (e) {
    if (e.target === this) closeForgot();
});

/* ═══════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════ */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeForgot();
    }
    if (e.key === 'Enter') {
        if (document.getElementById('forgotOverlay').classList.contains('open')) {
            handleForgot();
        } else if (document.getElementById('viewSignIn').classList.contains('active')) {
            handleSignIn();
        } else {
            handleSignUp();
        }
    }
});