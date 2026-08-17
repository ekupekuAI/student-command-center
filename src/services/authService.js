/**
 * authService.js — Authentication & profile API
 *
 * Wraps the backend /auth endpoints. Owns the in-memory "current user" used by
 * the shell. Passwords never leave this module's payloads except to the login
 * / register / change-password endpoints over HTTPS.
 */

import { apiClient } from './apiClient.js';
import tokenStore from './tokenStore.js';

function initialsOf(name) {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = (parts[0] || '?')[0] || '?';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
  return (first + last).toUpperCase();
}

class AuthService {
  constructor() {
    this._user = tokenStore.getUser();
  }

  /** @returns {{id, name, email, avatar_url, created_at, updated_at}|null} */
  get currentUser() {
    return this._user || tokenStore.getUser();
  }

  get initials() {
    return initialsOf(this.currentUser && this.currentUser.name);
  }

  /** Register a new account. Returns { user, message } — no session is created
   *  because the account is pending admin approval and cannot log in yet. */
  async register({ name, email, password }) {
    return apiClient.post('/auth/register', { name, email, password });
  }

  async login({ email, password }) {
    const data = await apiClient.post('/auth/login', { email, password });
    this._acceptSession(data);
    return data.user;
  }

  /** Server-side logout (revokes all tokens), then clears local session. */
  async logout() {
    if (tokenStore.hasToken()) {
      try {
        await apiClient.post('/auth/logout');
      } catch {
        // Best-effort: the local session is cleared regardless.
      }
    }
    tokenStore.clear();
    this._user = null;
  }

  /** Refresh the profile from the server (validates the token too). */
  async fetchMe() {
    const user = await apiClient.get('/auth/me');
    this._user = user;
    tokenStore.setUser(user);
    return user;
  }

  async updateProfile(updates) {
    const user = await apiClient.patch('/auth/me', updates);
    this._user = user;
    tokenStore.setUser(user);
    return user;
  }

  async changePassword(currentPassword, newPassword) {
    await apiClient.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  }

  async getStats() {
    return apiClient.get('/auth/me/stats');
  }

  _acceptSession(data) {
    tokenStore.setSession(data);
    this._user = data.user;
  }
}

export const authService = new AuthService();
export default authService;