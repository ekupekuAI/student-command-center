/**
 * admin.js — Admin & Master Admin pages
 *
 * Admin page (#/admin): approve/reject pending accounts and manage all users
 * (edit, reset password, delete). Master Admin page (#/master-admin): adds
 * role management (promote/demote). Access is enforced by the backend; the
 * page also shows an access-denied state for non-admins.
 */

import { icons } from '../icons.js';
import { authService } from '../services/authService.js';
import { showToast } from '../services/notify.js';
import { adminService, isAdmin, isMasterAdmin } from '../services/adminService.js';

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

const STATUS_LABEL = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const STATUS_CLASS = {
  pending: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-error',
};

const ROLE_LABEL = {
  user: 'User',
  admin: 'Admin',
  master_admin: 'Master',
};

const ROLE_CLASS = {
  user: 'badge-neutral',
  admin: 'badge-brand',
  master_admin: 'badge-warning',
};

export function AdminPage({ master = false } = {}) {
  const container = document.createElement('div');
  container.className = 'page-content';

  const me = authService.currentUser;
  const allowed = master ? isMasterAdmin(me) : isAdmin(me);

  if (!allowed) {
    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-text">
          <h2>${master ? 'Master Admin' : 'Admin'}</h2>
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

  let users = [];
  let pending = [];
  let loading = true;
  let error = '';

  const unsub = null;

  async function load() {
    loading = true;
    error = '';
    render();
    try {
      const [all, pendingList] = await Promise.all([
        adminService.listUsers(),
        adminService.listUsers('pending'),
      ]);
      users = all || [];
      pending = pendingList || [];
    } catch (err) {
      error = (err && err.message) || 'Could not load users.';
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

  function userRow(u) {
    const isMe = me && me.id === u.id;
    const showRoleControl = master && u.role !== 'master_admin';
    const canManageThis = !(u.role === 'master_admin' && u.id !== me.id);

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
          ${u.account_status !== 'approved' && canManageThis ? `<button class="btn btn-sm btn-primary" data-act="approve:${u.id}">Approve</button>` : ''}
          ${u.account_status !== 'rejected' && canManageThis ? `<button class="btn btn-sm btn-danger" data-act="reject:${u.id}">Reject</button>` : ''}
          ${canManageThis ? `<button class="btn btn-sm btn-secondary" data-act="edit:${u.id}">Edit</button>` : ''}
          ${canManageThis ? `<button class="btn btn-sm btn-secondary" data-act="reset:${u.id}">Reset password</button>` : ''}
          ${!isMe && canManageThis ? `<button class="btn btn-sm btn-danger" data-act="delete:${u.id}">Delete</button>` : ''}
          ${showRoleControl ? `
            <select class="admin-role-select" data-role="${u.id}" aria-label="Change role for ${esc(u.name)}">
              <option value="">Role…</option>
              <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
              <option value="master_admin">Master Admin</option>
            </select>
          ` : ''}
        </div>
      </div>
    `;
  }

  function render() {
    const title = master ? 'Master Admin' : 'Admin';
    const subtitle = master
      ? 'Approve accounts and manage every user, including admin roles.'
      : 'Approve new accounts and manage all users.';

    let body = '';
    if (loading) {
      body = `<div class="empty-state"><p>Loading users…</p></div>`;
    } else if (error) {
      body = `
        <div class="empty-state">
          <div class="empty-state-icon">${icons.x(30)}</div>
          <h4>Could not load users</h4>
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

      body = `${pendingSection}${allSection}`;
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

  container._destroy = () => {
    if (unsub) unsub();
  };

  return container;
}

export default AdminPage;