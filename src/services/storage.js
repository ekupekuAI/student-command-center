/**
 * storage.js — LocalStorage safe abstraction
 * Provides clean get/set/remove methods with JSON serialization
 * and fallback error handling. Easily swappable with API client.
 */

const STORAGE_PREFIX = 'scc_';

export const storage = {
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      return item ? JSON.parse(item) : defaultValue;
    } catch (err) {
      console.error(`[Storage] Failed to read key "${key}":`, err);
      return defaultValue;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`[Storage] Failed to save key "${key}":`, err);
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      return true;
    } catch (err) {
      console.error(`[Storage] Failed to remove key "${key}":`, err);
      return false;
    }
  },

  clear() {
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith(STORAGE_PREFIX)) {
          localStorage.removeItem(k);
        }
      });
      return true;
    } catch (err) {
      console.error('[Storage] Failed to clear items:', err);
      return false;
    }
  }
};
