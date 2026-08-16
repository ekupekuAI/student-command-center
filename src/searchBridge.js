/**
 * searchBridge.js — Minimal hand-off channel for the header global search.
 * The global search does not implement full cross-entity search yet; it
 * simply hands the typed query to the Tasks page, which already has a real
 * search implementation. The pending query is consumed once on navigation.
 */

let pendingSearch = '';

export function setPendingSearch(query) {
  pendingSearch = String(query || '').trim();
}

export function consumePendingSearch() {
  const query = pendingSearch;
  pendingSearch = '';
  return query;
}