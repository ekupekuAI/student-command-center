/**
 * tokenStore.js — JWT + user session persistence
 *
 * The ONLY module allowed to read/write the auth session in localStorage.
 * The token is sent by apiClient on every request; the cached user object
 * lets the shell render instantly while a fresh profile is fetched.
 *
 * Tokens are stored in localStorage (same origin as the SPA). They are never
 * logged and never sent to any third party.
 */

const TOKEN_KEY = 'scc-auth-token';
const USER_KEY = 'scc-auth-user';

function readUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const tokenStore = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY) || null;
  },

  getUser() {
    return readUser();
  },

  hasToken() {
    return Boolean(this.getToken());
  },

  setSession({ access_token, user }) {
    if (access_token) {
      localStorage.setItem(TOKEN_KEY, access_token);
    }
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  },

  setUser(user) {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
  },

  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export default tokenStore;