/**
 * admin.js — Admin console
 *
 * Admins land here instead of the student dashboard. The console is scoped to
 * user management only: approve/reject pending accounts, edit, reset passwords,
 * delete users, and manage roles. It also surfaces the admin's own sign-in
 * history (login count / last login) and recent actions. Access is enforced by
 * the backend; the page also shows an access-denied state for non-admins.
 */

import { icons } from '../icons.js';
import { authService } from '../services/authService.js';
import { showToast } from '../services/notify.js';
import { adminService, isAdmin } from '../services/adminService.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return '—';
  }
}

function timeAgo(iso) {
  if (!iso) return '';
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const STATUS_CLASS = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-error' };
const ROLE_LABEL = { user: 'User', admin: 'Admin' };
const ROLE_CLASS = { user: 'badge-neutral', admin: 'badge-brand' };

const ACTION_META = {
  approve:        { label: 'Approved',    accent: 'green' },
  reject:         { label: 'Rejected',    accent: 'red' },
  update:         { label: 'Updated',     accent: 'blue' },
  reset_password: { label: 'Password reset', accent: 'yellow' },
  delete:         { label: 'Deleted',     accent: 'red' },
  set_role:       { label: 'Role changed', accent: 'violet' },
};

export function AdminPage() {
  const container = document.createElement('div');
  container.className = 'page-content';

  const me = authService.currentUser;
  const allowed = isAdmin(me);

  if (!allowed) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <h2>Admin</h2>
          <p>Restricted area</p>
        </div>
      </div>
      <div class="card">
        <div class="empty-state">
          <div class="empty-state-icon">${icons.layers(32)}</div>
          <h4>Access denied</h4>
          <p>You don't have permission to view this page.</p>
          <p><a href="#/dashboard" style="color:var(--brand-500)">Back to Dashboard</a></p>
        </div>
      </div>
    `;
    return container;
  }

  let overview = null;
  let users = [];
  let pending = [];
  let loading = true;
  let error = '';

  async function load() {
    loading = true;
    error = '';
    render();
    try {
      const [ov, all, pendingList] = await Promise.all([
        adminService.getOverview(),
        adminService.listUsers(),
        adminService.listUsers('pending'),
      ]);
      overview = ov || null;
      users = all || [];
      pending = pendingList || [];
    } catch (err) {
      error = (err && err.message) || 'Could not load the admin console.';
    } finally {
      loading = false;
      render();
    }
  }

  async function run(fn, successMessage) {
    try {
      await fn();
      showToast(successMessage || 'Done.', 'success');
    } catch (err) {
      showToast((err && err.message) || 'That action could not be completed.', 'error');
    }
    load();
  }

  const actions = {
    approve: (id) => () => run(() => adminService.approve(id), 'Account approved.'),
    reject: (id) => () => run(() => adminService.reject(id), 'Account rejected.'),
    deleteUser: (id, name) => () => {
      if (window.confirm(`Permanently delete "${name}" and all of their data?`)) {
        run(() => adminService.deleteUser(id), 'Account deleted.');
      }
    },
    resetPassword: (id) => () => {
      const next = window.prompt('New password (minimum 8 characters):');
      if (!next) return;
      run(() => adminService.resetPassword(id, next), 'Password reset. The user must sign in again.');
    },
    editUser: (u) => () => {
      const name = window.prompt('Full name:', u.name);
      if (name === null || !name.trim()) return;
      const email = window.prompt('Email address:', u.email);
      if (email === null || !email.trim()) return;
      run(() => adminService.updateUser(u.id, { name: name.trim(), email: email.trim() }), 'User updated.');
    },
    setRole: (id) => (evt) => {
      const role = evt.target.value;
      if (!role) return;
      run(() => adminService.setRole(id, role), `Role set to ${ROLE_LABEL[role] || role}.`);
    },
  };

  function statusPill(status) {
    return `<span class="badge ${STATUS_CLASS[status] || 'badge-neutral'}">${STATUS_LABEL[status] || status}</span>`;
  }

  function rolePill(role) {
    return `<span class="badge ${ROLE_CLASS[role] || 'badge-neutral'}">${ROLE_LABEL[role] || role}</span>`;
  }

  function statCard(icon, accent, value, label) {
    return `
      <div class="stat-card">
        <div class="stat-icon-wrap accent-bg ${accent}">${icon}</div>
        <div class="stat-body">
          <div class="stat-value">${value}</div>
          <div class="stat-label">${label}</div>
        </div>
      </div>
    `;
  }

  function userRow(u) {
    const isMe = me && me.id === u.id;
    const roleControl = !isMe ? `
      <select class="admin-role-select" data-role="${u.id}" aria-label="Change role for ${esc(u.name)}">
        <option value="">Role…</option>
        <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
      </select>
    ` : '';

    return `
      <div class="admin-row">
        <div class="admin-cell admin-cell-main">
          <div class="admin-user">
            <div class="admin-avatar" aria-hidden="true">${esc(String(u.name || '?').trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase())}</div>
            <div class="admin-user-meta">
              <strong>${esc(u.name)}${isMe ? ' <span class="admin-you">(you)</span>' : ''}</strong>
              <small>${esc(u.email)}</small>
            </div>
          </div>
        </div>
        <div class="admin-cell">${rolePill(u.role)}</div>
        <div class="admin-cell">${statusPill(u.account_status)}</div>
        <div class="admin-cell admin-cell-date">${formatDate(u.created_at)}</div>
        <div class="admin-cell admin-actions">
          ${!isMe && u.account_status !== 'approved' ? `<button class="btn btn-sm btn-primary" data-act="approve:${u.id}">Approve</button>` : ''}
          ${!isMe && u.account_status !== 'rejected' ? `<button class="btn btn-sm btn-danger" data-act="reject:${u.id}">Reject</button>` : ''}
          ${!isMe ? `<button class="btn btn-sm btn-secondary" data-act="edit:${u.id}">Edit</button>` : ''}
          ${!isMe ? `<button class="btn btn-sm btn-secondary" data-act="reset:${u.id}">Reset password</button>` : ''}
          ${!isMe ? `<button class="btn btn-sm btn-danger" data-act="delete:${u.id}">Delete</button>` : ''}
          ${roleControl}
        </div>
      </div>
    `;
  }

  function overviewHtml() {
    if (!overview) return '';
    const c = overview.counts || {};
    const roleLabel = 'Admin';
    const loginWord = overview.login_count === 1 ? 'login' : 'logins';
    const lastLogin = overview.last_login_at ? formatDateTime(overview.last_login_at) : 'Never';
    const memberSince = me ? formatDate(me.created_at || overview.created_at) : '—';

    const activityRows = (overview.activity || []).map((a) => {
      const meta = ACTION_META[a.action] || { label: a.action, accent: 'blue' };
      return `
        <div class="admin-activity-row">
          <span class="admin-activity-dot accent-bg ${meta.accent}" aria-hidden="true"></span>
          <div class="admin-activity-body">
            <strong>${esc(meta.label)}</strong>
            <small>${esc(a.detail)}</small>
          </div>
          <span class="admin-activity-time">${timeAgo(a.created_at)}</span>
        </div>
      `;
    }).join('');

    return `
      <section class="admin-hero">
        <div class="admin-hero-text">
          <div class="admin-hero-eyebrow">Management console</div>
          <h3>Welcome back, ${esc(me ? me.name.split(' ')[0] : 'Admin')}</h3>
          <p>Approve new accounts and manage every user on the Command Center.</p>
        </div>
        <div class="admin-hero-badges">
          <span class="badge badge-brand">${roleLabel}</span>
          <span class="admin-hero-stat">${overview.login_count} ${loginWord}</span>
          <span class="admin-hero-stat">Last login ${lastLogin}</span>
        </div>
      </section>

      <div class="admin-stats">
        ${statCard(icons.user(22), 'accent-violet', c.total ?? '—', 'Total users')}
        ${statCard(icons.clock(22), 'accent-yellow', c.pending ?? '—', 'Pending')}
        ${statCard(icons.check(22), 'accent-green', c.approved ?? '—', 'Approved')}
        ${statCard(icons.x(22), 'accent-red', c.rejected ?? '—', 'Rejected')}
        ${statCard(icons.zap(22), 'accent-blue', c.admins ?? '—', 'Admins')}
      </div>

      <section class="card admin-activity" style="margin-bottom: var(--space-8)">
        <div class="card-header">
          <div>
            <div class="card-title">My activity</div>
            <div class="card-subtitle">Your sign-in history and recent actions</div>
          </div>
        </div>
        <div class="admin-activity-list">
          <div class="admin-activity-row">
            <span class="admin-activity-dot accent-bg accent-violet" aria-hidden="true"></span>
            <div class="admin-activity-body">
              <strong>Total logins</strong>
              <small>Signed in ${overview.login_count} time${overview.login_count === 1 ? '' : 's'}</small>
            </div>
            <span class="admin-activity-time">${lastLogin}</span>
          </div>
          <div class="admin-activity-row">
            <span class="admin-activity-dot accent-bg accent-blue" aria-hidden="true"></span>
            <div class="admin-activity-body">
              <strong>Member since</strong>
              <small>${memberSince}</small>
            </div>
          </div>
          ${activityRows || `<div class="empty-state" style="padding: var(--space-5)">
            <p>No actions taken yet — approve or manage accounts to see activity here.</p>
          </div>`}
        </div>
      </section>
    `;
  }

  function render() {
    const title = 'Admin';
    const subtitle = 'Manage users: approve, reject, edit, reset, delete, and manage roles.';

    let body = '';
    if (loading) {
      body = `<div class="empty-state"><p>Loading the admin console…</p></div>`;
    } else if (error) {
      body = `
        <div class="empty-state">
          <div class="empty-state-icon">${icons.x(30)}</div>
          <h4>Could not load the admin console</h4>
          <p>${esc(error)}</p>
          <button class="btn btn-secondary btn-sm" data-retry>Try again</button>
        </div>
      `;
    } else {
      const pendingSection = pending.length ? `
        <section class="card" style="margin-bottom:var(--space-8)">
          <div class="card-header">
            <div>
              <div class="card-title">Pending approvals</div>
              <div class="card-subtitle">New accounts waiting for your decision</div>
            </div>
            <span class="badge badge-warning">${pending.length} waiting</span>
          </div>
          <div class="admin-table">
            ${pending.map(userRow).join('')}
          </div>
        </section>
      ` : '';

      const allSection = `
        <section class="card">
          <div class="card-header">
            <div>
              <div class="card-title">All users</div>
              <div class="card-subtitle">${users.length} account${users.length === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div class="admin-table">
            <div class="admin-row admin-row-head">
              <div class="admin-cell admin-cell-main">User</div>
              <div class="admin-cell">Role</div>
              <div class="admin-cell">Status</div>
              <div class="admin-cell admin-cell-date">Joined</div>
              <div class="admin-cell admin-actions">Actions</div>
            </div>
            ${users.map(userRow).join('')}
          </div>
        </section>
      `;

      body = `${overviewHtml()}${pendingSection}${allSection}`;
    }

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <h2>${title}</h2>
          <p>${subtitle}</p>
        </div>
        <button class="btn btn-secondary" data-refresh>Refresh</button>
      </div>
      ${body}
    `;

    container.querySelector('[data-refresh]')?.addEventListener('click', load);

    if (error) {
      container.querySelector('[data-retry]')?.addEventListener('click', load);
    }

    container.querySelectorAll('[data-act]').forEach((btn) => {
      const [action, id] = btn.dataset.act.split(':');
      const handler = actions[action];
      const user = users.find((u) => u.id === id);
      if (handler && user) btn.addEventListener('click', handler(user));
    });

    container.querySelectorAll('[data-role]').forEach((select) => {
      select.addEventListener('change', actions.setRole(select.dataset.role));
    });
  }

  load();

  container._destroy = () => {};

  return container;
}

export default AdminPage;