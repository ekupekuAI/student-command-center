/**
 * auth.js — Sign in / Create account
 *
 * Premium split-screen screen rendered outside the app shell (when the user
 * is not authenticated). Left panel: brand + value props. Right panel: the
 * login/register form. On success it calls `onSuccess()` so the app can mount
 * the shell.
 */

import { icons } from '../icons.js';
import { authService } from '../services/authService.js';
import { showToast } from '../services/notify.js';

const FEATURES = [
  { icon: 'tasks', title: 'Plan & track', text: 'Assignments, deadlines, and priorities in one place.' },
  { icon: 'study', title: 'Focus timer', text: 'Pomodoro sessions with study history and streaks.' },
  { icon: 'notes', title: 'Smart notes', text: 'Lecture notes organized by subject, pinned and searchable.' },
  { icon: 'ai', title: 'AI study assistant', text: 'Plans, summaries, and answers grounded in your data.' },
  { icon: 'analytics', title: 'Progress analytics', text: 'Hours studied, task completion, and weekly goals.' },
  { icon: 'settings', title: 'Your space', text: 'Everything synced and private to your account.' },
];

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child instanceof Node) node.appendChild(child);
    else if (typeof child === 'string') node.insertAdjacentHTML('beforeend', child);
  }
  return node;
};

function setError(input, message) {
  const field = input.closest('.auth-field');
  if (!field) return;
  let errorEl = field.querySelector('.auth-field-error');
  if (!errorEl) {
    errorEl = el('span', { className: 'auth-field-error' });
    field.appendChild(errorEl);
  }
  errorEl.textContent = message;
}

function clearError(input) {
  const field = input.closest('.auth-field');
  if (field) field.querySelector('.auth-field-error')?.remove();
}

function buildForm({ mode, onSuccess }) {
  const isLogin = mode === 'login';
  const card = el('div', { className: 'auth-card auth-enter', style: 'animation-delay: 90ms' });

  card.innerHTML = `
    <div class="auth-card-head">
      <h2>${isLogin ? 'Welcome back' : 'Create your account'}</h2>
      <p>${isLogin ? 'Sign in to pick up where you left off.' : 'Start managing your semester in a few seconds.'}</p>
    </div>
    <form novalidate>
      ${isLogin ? '' : `
      <div class="auth-field">
        <label for="auth-name">Full name</label>
        <div class="auth-input-wrap">
          ${icons.profile(16)}
          <input id="auth-name" name="name" type="text" autocomplete="name" placeholder="Alex Johnson" required />
        </div>
      </div>
      `}
      <div class="auth-field">
        <label for="auth-email">Email address</label>
        <div class="auth-input-wrap">
          ${icons.user(16)}
          <input id="auth-email" name="email" type="email" autocomplete="email" placeholder="you@university.edu" required />
        </div>
      </div>
      <div class="auth-field">
        <label for="auth-password">Password</label>
        <div class="auth-input-wrap">
          <span class="auth-lock-icon" aria-hidden="true">${icons.lock ? icons.lock(16) : ''}</span>
          <input id="auth-password" name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" placeholder="${isLogin ? '••••••••' : 'At least 8 characters'}" required ${isLogin ? '' : 'minlength="8"'} />
          <button type="button" class="auth-eye" data-eye aria-label="Show password" tabindex="-1"></button>
        </div>
        ${isLogin ? '' : '<span class="auth-hint">Minimum 8 characters.</span>'}
      </div>
      ${isLogin ? '' : `
      <div class="auth-field">
        <label for="auth-confirm">Confirm password</label>
        <div class="auth-input-wrap">
          <span class="auth-lock-icon" aria-hidden="true">${icons.lock ? icons.lock(16) : ''}</span>
          <input id="auth-confirm" name="confirm" type="password" autocomplete="new-password" placeholder="Repeat password" required minlength="8" />
        </div>
      </div>
      `}
      <button type="submit" class="auth-submit" data-submit>
        <span data-submit-label>${isLogin ? 'Sign In' : 'Create Account'}</span>
        <span class="auth-spinner" hidden></span>
      </button>
      <div class="auth-card-foot">
        ${isLogin
          ? `Don't have an account? <button type="button" class="auth-switch" data-switch>Create one</button>`
          : `Already have an account? <button type="button" class="auth-switch" data-switch>Sign in</button>`}
      </div>
    </form>
  `;

  // Eye toggle uses an inline SVG to avoid an extra dependency.
  const eyeBtn = card.querySelector('[data-eye]');
  if (eyeBtn) {
    const show = 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24';
    const hide = 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22';
    eyeBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="${show}"/>
      </svg>
    `;
    eyeBtn.addEventListener('click', () => {
      const input = card.querySelector('#auth-password');
      const isShown = input.type === 'text';
      input.type = isShown ? 'password' : 'text';
      eyeBtn.querySelector('path').setAttribute('d', isShown ? show : hide);
    });
  }

  const form = card.querySelector('form');
  const submitBtn = card.querySelector('[data-submit]');
  const spinner = card.querySelector('.auth-spinner');
  const submitLabel = card.querySelector('[data-submit-label]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const inputs = Array.from(form.querySelectorAll('input'));
    inputs.forEach(clearError);

    const email = form.querySelector('#auth-email').value.trim();
    const password = form.querySelector('#auth-password').value;
    const name = form.querySelector('#auth-name')?.value.trim() || '';
    const confirm = form.querySelector('#auth-confirm')?.value || '';

    if (!email) return setError(form.querySelector('#auth-email'), 'Email is required.');
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError(form.querySelector('#auth-email'), 'Enter a valid email address.');
    if (!password) return setError(form.querySelector('#auth-password'), 'Password is required.');
    if (!isLogin) {
      if (!name) return setError(form.querySelector('#auth-name'), 'Name is required.');
      if (password.length < 8) return setError(form.querySelector('#auth-password'), 'Password must be at least 8 characters.');
      if (password !== confirm) return setError(form.querySelector('#auth-confirm'), 'Passwords do not match.');
    }

    submitBtn.disabled = true;
    spinner.hidden = false;
    submitLabel.textContent = isLogin ? 'Signing in…' : 'Creating account…';

    try {
      if (isLogin) {
        await authService.login({ email, password });
      } else {
        await authService.register({ name, email, password });
      }
      showToast(isLogin ? 'Welcome back!' : 'Account created — welcome to Command Center!', 'success');
      onSuccess();
    } catch (err) {
      showToast((err && err.message) || 'Something went wrong. Please try again.', 'error');
      submitBtn.disabled = false;
      spinner.hidden = true;
      submitLabel.textContent = isLogin ? 'Sign In' : 'Create Account';
    }
  });

  const switchBtn = card.querySelector('[data-switch]');
  switchBtn.addEventListener('click', () => onSwitch(mode));

  return card;
}

let onSwitch = () => {};

/**
 * Help Center — an expandable "how to sign in & get started" guide shown on
 * the auth screen. Pure static guidance: no account data, no credentials.
 */
function buildHelp() {
  const wrap = el('div', { className: 'auth-help auth-enter', style: 'animation-delay: 220ms' });
  wrap.innerHTML = `
    <button type="button" class="auth-help-toggle" data-help-toggle aria-expanded="false" aria-controls="authHelpBody">
      <span class="auth-help-toggle-icon" aria-hidden="true">${icons.messageSquare(16)}</span>
      <span class="auth-help-toggle-label">Help Center — how to sign in</span>
      <span class="auth-help-chevron" aria-hidden="true">${icons.chevronDown(16)}</span>
    </button>
    <div class="auth-help-body" id="authHelpBody">
      <div class="auth-help-section">
        <h4>1 · Create your account</h4>
        <ol>
          <li>On this screen, tap <strong>Create one</strong> under the sign-in button.</li>
          <li>Enter your full name, your email address, and a password of 8 or more characters.</li>
          <li>Tap <strong>Create Account</strong> — you'll be signed in automatically.</li>
        </ol>
      </div>
      <div class="auth-help-section">
        <h4>2 · Sign in</h4>
        <ol>
          <li>Enter the email and password you registered with.</li>
          <li>Tap <strong>Sign In</strong> to open your Command Center.</li>
          <li>You stay signed in on this device for up to 7 days.</li>
        </ol>
      </div>
      <div class="auth-help-section">
        <h4>3 · Explore your Command Center</h4>
        <ul>
          <li><strong>Dashboard</strong> — your week at a glance.</li>
          <li><strong>Subjects · Tasks · Notes</strong> — organize your coursework.</li>
          <li><strong>Study Sessions</strong> — run a focus timer.</li>
          <li><strong>AI Assistant</strong> — get help grounded in your own data.</li>
          <li><strong>Analytics</strong> — track study time and progress.</li>
        </ul>
      </div>
      <div class="auth-help-section">
        <h4>4 · Staying secure</h4>
        <ul>
          <li>Your data stays private to your account.</li>
          <li>Use <strong>Sign out</strong> when you leave a shared device.</li>
          <li>Choose a strong, unique password — and never share it.</li>
        </ul>
      </div>
    </div>
  `;

  const toggle = wrap.querySelector('[data-help-toggle]');
  const body = wrap.querySelector('.auth-help-body');
  toggle.addEventListener('click', () => {
    const open = body.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
  return wrap;
}

export function setAuthSwitchHandler(handler) {
  onSwitch = handler;
}

export function AuthPage({ onSuccess, initialMode = 'login' }) {
  const wrapper = el('div', { className: 'auth-page' });

  const left = el('aside', { className: 'auth-side' });
  left.appendChild(el('div', { className: 'auth-orb', 'aria-hidden': 'true' }));
  left.innerHTML += `
    <div class="auth-side-brand auth-enter">
      <div class="auth-side-logo" aria-hidden="true">SC</div>
      <span>Command Center</span>
    </div>
    <div class="auth-side-body">
      <h1 class="auth-enter" style="animation-delay:70ms">Your semester,<br /><em>under control.</em></h1>
      <p class="auth-side-sub auth-enter" style="animation-delay:130ms">One hub for courses, tasks, notes, study time, and an AI assistant that knows your workload.</p>
      <ul class="auth-side-features">
        ${FEATURES.map((f, i) => `
          <li class="auth-enter" style="animation-delay:${180 + i * 45}ms">
            <span class="auth-side-feature-icon">${icons[f.icon]?.(18) || ''}</span>
            <span><strong>${f.title}</strong><small>${f.text}</small></span>
          </li>
        `).join('')}
      </ul>
    </div>
    <p class="auth-side-foot auth-enter" style="animation-delay:460ms">Your data stays yours — stored in your private account.</p>
  `;

  const right = el('div', { className: 'auth-main' });
  const panel = el('div', { className: 'auth-panel' });
  panel.appendChild(el('div', { className: 'auth-mobile-brand' }, '<div class="auth-mobile-logo" aria-hidden="true">SC</div><span>Student Command Center</span>'));
  const form = buildForm({ mode: initialMode, onSuccess });
  panel.appendChild(form);
  panel.appendChild(buildHelp());
  right.appendChild(panel);

  wrapper.appendChild(left);
  wrapper.appendChild(right);
  return wrapper;
}

export default AuthPage;