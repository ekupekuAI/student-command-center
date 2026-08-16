/**
 * router.js — Lightweight hash-based SPA router
 *
 * Usage:
 *   router.register('#/dashboard', DashboardPage)
 *   router.start()
 */

export class Router {
  constructor({ outlet, onNavigate }) {
    this._routes = new Map();
    this._outlet = outlet;         // DOM element to render pages into
    this._onNavigate = onNavigate; // callback(path) fired on each navigation
    this._currentPath = null;

    this._handleHashChange = this._handleHashChange.bind(this);
  }

  /** Register a route path → page factory function */
  register(path, pageFactory) {
    this._routes.set(path, pageFactory);
    return this;
  }

  /** Start listening to hash changes */
  start() {
    window.addEventListener('hashchange', this._handleHashChange);
    // Navigate to current hash on first load
    this._handleHashChange();
  }

  /** Programmatically navigate */
  navigate(path) {
    window.location.hash = path;
  }

  /** Current active path */
  get currentPath() {
    return this._currentPath;
  }

  _getHash() {
    const hash = window.location.hash || '#/dashboard';
    // Normalize: ensure starts with #/
    return hash.startsWith('#/') ? hash : '#/' + hash.slice(1);
  }

  _handleHashChange() {
    const path = this._getHash();
    this._currentPath = path;

    // Find matching route (exact match first, then fallback)
    const factory = this._routes.get(path) || this._routes.get('#/dashboard');

    if (typeof this._onNavigate === 'function') {
      this._onNavigate(path);
    }

    if (factory && this._outlet) {
      // Call cleanup hook on previous page if present
      if (this._outlet.firstElementChild && typeof this._outlet.firstElementChild._destroy === 'function') {
        try {
          this._outlet.firstElementChild._destroy();
        } catch (e) {
          console.error('[Router] Error in page cleanup hook:', e);
        }
      }

      // Clear outlet and render new page
      this._outlet.innerHTML = '';
      const pageEl = factory();
      if (pageEl instanceof Node) {
        this._outlet.appendChild(pageEl);
      } else if (typeof pageEl === 'string') {
        this._outlet.innerHTML = pageEl;
      }
      // Scroll to top on navigation
      this._outlet.parentElement?.scrollTo?.({ top: 0, behavior: 'instant' });
    }
  }

  destroy() {
    window.removeEventListener('hashchange', this._handleHashChange);
  }
}
