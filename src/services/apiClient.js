/**
 * apiClient.js — Centralized API client
 *
 * The ONLY module in the frontend that talks to the backend. Pages and UI
 * components must go through the service layer, never call fetch() directly.
 *
 * Configuration:
 *   VITE_API_BASE_URL  (in frontend .env / .env.example)
 *   Defaults to the local FastAPI dev server when not set.
 *
 * Behaviour:
 *   - JSON serialization / deserialization
 *   - request timeout via AbortController
 *   - normalized ApiError with user-friendly messages
 *   - connectivity tracking so the shell can show an offline banner
 */

const DEFAULT_BASE_URL = 'http://127.0.0.1:8000/api';

import tokenStore from './tokenStore.js';

function resolveBaseUrl() {
  const configured = (typeof import.meta !== 'undefined' && import.meta.env)
    ? import.meta.env.VITE_API_BASE_URL
    : undefined;
  return (configured || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export const API_BASE_URL = resolveBaseUrl();

// Endpoints that must never receive a token (public auth entry points).
const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/register'];

// Auth endpoints whose 401s are never treated as "session expired" (so login
// failures and the profile-refresh path don't trigger a redirect loop).
const AUTH_PREFIX = '/auth/';

function isPublicAuth(path) {
  return PUBLIC_AUTH_PATHS.includes(path);
}

// Marker header used by the one-time migration uploader so the backend does
// not create duplicate activity entries while importing local history.
export const MIGRATION_HEADER = { 'X-Migration': '1' };

/**
 * Normalized API error with a user-facing message.
 */
export class ApiError extends Error {
  constructor(message, { status = 0, offline = false, data = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.offline = offline;
    this.data = data;
  }
}

function friendlyMessage(status, payload) {
  // Backend may return a friendly string detail for these statuses
  // (e.g. the AI assistant's availability errors on 429 / 5xx, or the
  // generic "Invalid email or password" on failed logins).
  const stringDetail = payload && typeof payload.detail === 'string' ? payload.detail : null;
  if (stringDetail && (status === 400 || status === 401 || status === 404 || status === 409 || status === 429 || status >= 500)) {
    return stringDetail;
  }
  if (status === 422) {
    if (Array.isArray(payload && payload.detail) && payload.detail.length > 0) {
      return payload.detail[0].msg || 'Some of the provided data is invalid.';
    }
    return 'Some of the provided data is invalid.';
  }
  if (status >= 500) return 'The server encountered an error. Please try again.';
  return 'The request could not be completed. Please try again.';
}

/* ─────────────────────────────────────────────────────────────
   Connectivity tracking
   ───────────────────────────────────────────────────────────── */

let offline = false;
const statusListeners = new Set();

export function isOffline() {
  return offline;
}

function setOffline(value) {
  if (offline === value) return;
  offline = value;
  for (const cb of statusListeners) {
    try { cb(offline); } catch (err) { console.error('[apiClient] listener error:', err); }
  }
}

export function onStatusChange(callback) {
  statusListeners.add(callback);
  return () => statusListeners.delete(callback);
}

/**
 * Cheap liveness probe against the backend health endpoint.
 * Short timeout; never throws.
 * @returns {Promise<boolean>}
 */
export async function checkHealth() {
  try {
    await request('GET', '/health', { timeout: 4000 });
    setOffline(false);
    return true;
  } catch (err) {
    if (err && err.offline) setOffline(true);
    return false;
  }
}

/* ─────────────────────────────────────────────────────────────
   Core request
   ───────────────────────────────────────────────────────────── */

/**
 * Perform a JSON request against the API.
 * @param {string} method  GET | POST | PATCH | DELETE
 * @param {string} path    e.g. "/tasks"
 * @param {Object} [options]
 * @param {Object} [options.body]    JSON body (serialized automatically)
 * @param {Object} [options.headers] extra headers
 * @param {number} [options.timeout] ms before aborting (default 10000)
 * @returns {Promise<Object|null>} parsed JSON body (null for 204)
 */
export async function request(method, path, options = {}) {
  const {
    body,
    headers = {},
    timeout = 10000,
    skipAuth = false,
  } = options;

  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const isPublic = isPublicAuth(path);
  const token = !skipAuth ? tokenStore.getToken() : null;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && !isPublic ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    setOffline(true);
    const isAbort = err && err.name === 'AbortError';
    throw new ApiError(
      isAbort
        ? 'The server is taking too long to respond. Please try again.'
        : 'Unable to connect to the server. Your data could not be saved.',
      { offline: true, data: err },
    );
  } finally {
    clearTimeout(timer);
  }

  let payload = null;
  const raw = await response.text().catch(() => '');
  if (raw) {
    try { payload = JSON.parse(raw); } catch { payload = null; }
  }

  if (!response.ok) {
    setOffline(true);
    // An expired/revoked token on a protected endpoint: clear the session and
    // let the app bounce to the auth screen.
    if (response.status === 401 && !path.startsWith(AUTH_PREFIX) && !skipAuth) {
      tokenStore.clear();
      window.dispatchEvent(new CustomEvent('scc:unauthorized'));
    }
    throw new ApiError(friendlyMessage(response.status, payload), {
      status: response.status,
      offline: false,
      data: payload,
    });
  }

  setOffline(false);
  return payload;
}

export const apiClient = {
  API_BASE_URL,
  get: (path, options) => request('GET', path, options),
  post: (path, body, options = {}) => request('POST', path, { ...options, body }),
  patch: (path, body, options = {}) => request('PATCH', path, { ...options, body }),
  delete: (path, options) => request('DELETE', path, options),
  request,
  isOffline,
  onStatusChange,
  checkHealth,
};

export default apiClient;