/**
 * shell.js — Application shell component
 * Builds the persistent layout: sidebar + header + main outlet
 * Subscribes to taskService for live navigation badge counters.
 */

import { icons } from './icons.js';
import { authService } from './services/authService.js';
import { taskService } from './services/taskService.js';
import { setPendingSearch } from './searchBridge.js';
import { isOffline, onStatusChange } from './services/apiClient.js';

// Navigation route definitions
const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { path: '#/dashboard', label: 'Dashboard',     iconKey: 'dashboard' },
      { path: '#/subjects',  label: 'Subjects',      iconKey: 'subjects'  },
      { path: '#/tasks',     label: 'Tasks',         iconKey: 'tasks',    hasBadge: true },
      { path: '#/study',     label: 'Study Sessions', iconKey: 'study'   },
      { path: '#/notes',     label: 'Notes',         iconKey: 'notes'     },
    ],
  },
  {
    label: 'Insights',
    items: [
      { path: '#/analytics', label: 'Analytics',    iconKey: 'analytics' },
      { path: '#/ai',        label: 'AI Assistant', iconKey: 'ai'        },
    ],
  },
  {
    label: 'Account',
    items: [
      { path: '#/profile',  label: 'Profile',   iconKey: 'profile'  },
      { path: '#/settings', label: 'Settings',  iconKey: 'settings' },
    ],
  },
];

// ── DOM builder helpers ──────────────────────────────────────

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function el(tag, attrs = {}, ...children) {
  const elem = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') { elem.className = v; }
    else if (k === 'innerHTML') { elem.innerHTML = v; }
    else if (k.startsWith('on') && typeof v === 'function') { elem.addEventListener(k.slice(2).toLowerCase(), v); }
    else { elem.setAttribute(k, v); }
  }
  for (const child of children) {
    if (child instanceof Node) elem.appendChild(child);
    else if (typeof child === 'string') elem.insertAdjacentHTML('beforeend', child);
  }
  return elem;
}

// ── Theme Management ─────────────────────────────────────────

const THEME_KEY = 'scc-theme';

function resolveTheme(theme) {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'dark' ? 'dark' : 'light';
}

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', resolveTheme(theme));
  localStorage.setItem(THEME_KEY, theme);
}

function getResolvedTheme() {
  return document.documentElement.getAttribute('data-theme') || 'light';
}

// Keep the theme in sync when the OS preference changes while on 'system'.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getTheme() === 'system') {
    document.documentElement.setAttribute('data-theme', resolveTheme('system'));
  }
});

// ── Shell Factory ────────────────────────────────────────────

export function createShell() {
  // Apply stored theme immediately
  setTheme(getTheme());

  const user = authService.currentUser || { name: 'Student', initials: 'SC', email: '' };
  const userInitials = user.initials || 'SC';

  const shell = el('div', { className: 'app-shell' });
  const overlay = el('div', { className: 'sidebar-overlay' });

  // ── Sidebar ────────────────────────────────────────────────
  const sidebar = el('aside', { className: 'sidebar', role: 'navigation', 'aria-label': 'Main navigation' });

  // Brand
  const brand = el('a', { className: 'sidebar-brand', href: '#/dashboard', 'aria-label': 'Student Command Center home' });
  brand.innerHTML = `
    <div class="sidebar-brand-icon" aria-hidden="true">SC</div>
    <div class="sidebar-brand-text">
      <div class="sidebar-brand-name">Command Center</div>
      <div class="sidebar-brand-tagline">Student Hub</div>
    </div>
  `;
  sidebar.appendChild(brand);

  // Nav
  const nav = el('nav', { className: 'sidebar-nav' });

  const allNavItems = [];

  for (const section of NAV_SECTIONS) {
    const sectionLabel = el('div', { className: 'nav-section-label' }, section.label);
    nav.appendChild(sectionLabel);

    for (const item of section.items) {
      const navItem = el('button', {
        className: 'nav-item',
        'data-path': item.path,
        'aria-label': item.label,
      });

      navItem.innerHTML = `
        <span class="nav-item-icon">${icons[item.iconKey]?.(18) || ''}</span>
        <span class="nav-item-label">${item.label}</span>
        ${item.hasBadge ? `<span class="nav-item-badge" id="tasksNavBadge">0</span>` : ''}
      `;

      navItem.addEventListener('click', () => {
        window.location.hash = item.path;
      });

      nav.appendChild(navItem);
      allNavItems.push({ el: navItem, path: item.path, hasBadge: item.hasBadge });
    }
  }

  sidebar.appendChild(nav);

  // Divider + footer
  sidebar.appendChild(el('div', { className: 'sidebar-divider' }));

  const footer = el('div', { className: 'sidebar-footer' });
  const userBtn = el('div', { className: 'sidebar-user', role: 'button', tabindex: '0', 'aria-label': 'User profile' });
  userBtn.innerHTML = `
    <div class="user-avatar" aria-hidden="true">${userInitials}</div>
    <div class="user-info">
      <div class="user-name">${esc(user.name)}</div>
      <div class="user-role truncate">${esc(user.email)}</div>
    </div>
    <button class="sidebar-toggle" id="sidebarToggleBtn" aria-label="Collapse sidebar" title="Toggle sidebar">
      ${icons.chevronLeft(14)}
    </button>
  `;
  userBtn.addEventListener('click', (e) => {
    if (!e.target.closest('#sidebarToggleBtn')) {
      window.location.hash = '#/profile';
    }
  });

  const logoutBtn = el('button', {
    className: 'sidebar-logout',
    type: 'button',
    'aria-label': 'Sign out',
    title: 'Sign out',
  });
  logoutBtn.innerHTML = `
    <span class="sidebar-logout-icon">${icons.chevronRight(16)}</span>
    <span class="sidebar-logout-label">Sign out</span>
  `;
  logoutBtn.addEventListener('click', () => {
    authService.logout()
      .finally(() => {
        window.dispatchEvent(new CustomEvent('scc:signed-out'));
      });
  });

  footer.appendChild(userBtn);
  footer.appendChild(logoutBtn);
  sidebar.appendChild(footer);

  // ── Header ─────────────────────────────────────────────────
  const header = el('header', { className: 'app-header', role: 'banner' });
  header.innerHTML = `
    <button class="mobile-menu-btn" id="mobileMenuBtn" aria-label="Open navigation menu">
      ${icons.menu(20)}
    </button>
    <div class="header-breadcrumb">
      <span class="breadcrumb-page" id="breadcrumbPage">Dashboard</span>
    </div>
    <div class="header-actions">
      <div class="header-search" role="search">
        ${icons.search(15)}
        <input type="search" placeholder="Search tasks, subjects..." aria-label="Search" id="globalSearch" />
      </div>
      <button class="icon-btn" id="themeToggleBtn" aria-label="Toggle theme" title="Toggle dark/light mode">
        ${icons.sun(18)}
      </button>
      <button class="icon-btn" id="notifBtn" aria-label="Go to tasks" title="Go to tasks" onclick="window.location.hash='#/tasks'">
        ${icons.bell(18)}
      </button>
      <div class="header-avatar" role="button" tabindex="0" aria-label="User menu" id="headerAvatar">
        ${userInitials}
      </div>
    </div>
  `;

  // ── Main content outlet ────────────────────────────────────
  const main = el('main', { className: 'app-main', id: 'pageOutlet', role: 'main' });

  // ── Offline banner ─────────────────────────────────────────
  const offlineBanner = el('div', { className: 'app-offline-banner', id: 'appOfflineBanner', hidden: true });
  offlineBanner.innerHTML = `
    <span class="app-offline-dot" aria-hidden="true"></span>
    <span>You are offline. Data is being read locally and changes can't be saved until the server is reachable.</span>
  `;

  const applyOfflineBanner = () => {
    offlineBanner.hidden = !isOffline();
  };
  applyOfflineBanner();
  onStatusChange(() => applyOfflineBanner());

  // Assemble shell
  shell.appendChild(sidebar);
  shell.appendChild(header);
  shell.appendChild(offlineBanner);
  shell.appendChild(main);
  document.body.appendChild(overlay);
  document.body.appendChild(shell);

  // ── Sidebar collapse ───────────────────────────────────────
  let collapsed = localStorage.getItem('scc-sidebar-collapsed') === 'true';
  const applyCollapse = () => {
    shell.classList.toggle('sidebar-collapsed', collapsed);
    const btn = document.getElementById('sidebarToggleBtn');
    if (btn) {
      btn.innerHTML = collapsed ? icons.chevronRight(14) : icons.chevronLeft(14);
      btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    }
    localStorage.setItem('scc-sidebar-collapsed', collapsed);
  };
  applyCollapse();

  document.getElementById('sidebarToggleBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    collapsed = !collapsed;
    applyCollapse();
  });

  // ── Mobile sidebar toggle ──────────────────────────────────
  document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
    overlay.classList.toggle('visible');
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('visible');
  });

  // ── Theme toggle ───────────────────────────────────────────
  const updateThemeIcon = () => {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.innerHTML = isDark ? icons.sun(18) : icons.moon(18);
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  };
  updateThemeIcon();

  document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    setTheme(isDark ? 'light' : 'dark');
    updateThemeIcon();
  });

  // Header avatar → profile
  document.getElementById('headerAvatar')?.addEventListener('click', () => {
    window.location.hash = '#/profile';
  });

  // Global search: hands the typed query to the Tasks page search
  const globalSearch = document.getElementById('globalSearch');
  globalSearch?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      setPendingSearch(globalSearch.value);
      globalSearch.value = '';
      window.location.hash = '#/tasks';
    }
  });

  // ── Task Badge Synchronizer ────────────────────────────────
  function updateBadges() {
    const stats = taskService.getTaskStats();
    const badgeEl = document.getElementById('tasksNavBadge');
    if (badgeEl) {
      badgeEl.textContent = stats.pending;
      badgeEl.style.display = stats.pending > 0 ? 'inline-block' : 'none';
    }
  }

  updateBadges();
  taskService.subscribe(() => updateBadges());

  // ── Active nav state update ────────────────────────────────
  const PAGE_LABELS = {
    '#/dashboard': 'Dashboard',
    '#/subjects':  'Subjects',
    '#/tasks':     'Tasks & Assignments',
    '#/study':     'Study Sessions',
    '#/notes':     'Notes',
    '#/analytics': 'Analytics',
    '#/ai':        'AI Assistant',
    '#/profile':   'Profile',
    '#/settings':  'Settings',
  };

  function updateActiveNav(path) {
    for (const { el: item, path: p } of allNavItems) {
      item.classList.toggle('active', p === path);
    }
    const breadcrumb = document.getElementById('breadcrumbPage');
    if (breadcrumb) breadcrumb.textContent = PAGE_LABELS[path] || 'Dashboard';

    // Close mobile menu on navigation
    sidebar.classList.remove('mobile-open');
    overlay.classList.remove('visible');
  }

  return {
    outlet: main,
    updateActiveNav,
  };
}
