/**
 * notify.js — Minimal user-facing toast notifications
 * Used to surface API/network errors (and occasional success feedback)
 * without any framework. Styles live in components.css (.app-toast*).
 */

const TOAST_LIMIT = 4;
let container = null;

function ensureContainer() {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.className = 'app-toast-container';
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
  return container;
}

/**
 * Show a toast message.
 * @param {string} message
 * @param {string} [kind]  'error' | 'success' | 'info' (default 'info')
 */
export function showToast(message, kind = 'info', duration = 4200) {
  const wrap = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `app-toast app-toast-${kind}`;
  const icon = kind === 'error' ? '⚠' : kind === 'success' ? '✓' : 'ℹ';
  toast.innerHTML = `<span class="app-toast-icon">${icon}</span><span class="app-toast-msg"></span>`;
  toast.querySelector('.app-toast-msg').textContent = message;

  while (wrap.children.length >= TOAST_LIMIT) {
    wrap.removeChild(wrap.firstChild);
  }
  wrap.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('app-toast-leaving');
    setTimeout(() => toast.remove(), 220);
  }, duration);
}

/**
 * Show an error toast from an ApiError (or any error), with a sensible
 * fallback message so a save failure is never reported as a success.
 */
export function showErrorToast(err) {
  const message = (err && err.message) || 'Something went wrong. Your data could not be saved.';
  showToast(message, 'error');
}

export default { showToast, showErrorToast };