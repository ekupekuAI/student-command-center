/**
 * activityService.js — Activity Stream Service
 * Reads the activity feed from the backend (GET /api/activities). Activity
 * entries are created SERVER-SIDE when mutations happen, so the frontend
 * never writes duplicate records. `logActivity` is kept as a deprecated
 * compatibility no-op for any legacy callers.
 *
 * The feed is re-fetched after mutations (see domain services) and the
 * timestamp handling below supports both ISO strings (backend) and epoch
 * numbers (legacy local entries).
 */

import { apiClient } from './apiClient.js';
import { storage } from './storage.js';
import { activityToUi } from './mappers.js';

const STORAGE_KEY = 'activities';

class ActivityService {
  constructor() {
    this._subscribers = new Set();
    this._cache = null;
    this._source = null;
  }

  /** (Re)load the activity feed from the backend. */
  async refresh() {
    try {
      const data = await apiClient.get('/activities?limit=100');
      this._cache = (Array.isArray(data) ? data : []).map(activityToUi);
      this._source = 'api';
    } catch (err) {
      if (err && err.offline) {
        const local = storage.get(STORAGE_KEY, []);
        this._cache = (Array.isArray(local) ? local : []).map(activityToUi);
        this._source = 'local';
      } else {
        this._cache = this._cache || [];
        this._source = 'api';
      }
    }
    this._notify();
  }

  _ensureLoaded() {
    if (this._cache === null) {
      this._cache = [];
      this.refresh();
    }
  }

  /** Retrieve activities, newest first */
  getAllActivities(limit = 10) {
    this._ensureLoaded();
    return (this._cache || [])
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  /**
   * DEPRECATED — the backend now records activity entries automatically when
   * data mutations occur. Kept as a no-op so any legacy callers do nothing.
   * @returns {null}
   */
  logActivity() {
    // Activity creation is authoritative on the server. No-op.
    return null;
  }

  /** Format a timestamp into a human-readable relative string */
  formatRelativeTime(timestamp) {
    if (!timestamp) return 'Recently';
    const ts = typeof timestamp === 'number' ? timestamp : new Date(timestamp).getTime();
    if (!Number.isFinite(ts)) return 'Recently';

    const now = Date.now();
    const diff = Math.max(0, now - ts);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 45) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;

    return new Date(ts).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  /** Subscribe to activity changes */
  subscribe(callback) {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  _notify() {
    for (const callback of this._subscribers) {
      try {
        callback();
      } catch (err) {
        console.error('[ActivityService] Subscriber error:', err);
      }
    }
  }
}

export const activityService = new ActivityService();