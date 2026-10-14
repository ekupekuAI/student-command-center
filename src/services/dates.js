/**
 * dates.js — local-calendar date helpers
 *
 * `toISOString()` is UTC, so slicing it gives the wrong calendar day for
 * anyone not on UTC (e.g. before 05:30 in India it still reports yesterday).
 * Due dates are plain YYYY-MM-DD strings in the user's local calendar, so all
 * "today / tomorrow / overdue / same day" comparisons go through these helpers.
 */

/** YYYY-MM-DD for the given moment in the user's local timezone. */
export function localDateStr(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local YYYY-MM-DD `offsetDays` from today (DST-safe, unlike +86400000ms). */
export function localDateOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return localDateStr(d);
}

/**
 * Parse a date value; a bare YYYY-MM-DD is treated as local midnight
 * (the Date constructor would otherwise read it as UTC midnight).
 */
export function parseLocalDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
}
