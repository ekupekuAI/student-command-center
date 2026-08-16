/**
 * profile.js — Student Profile
 * Account identity, live stats (from the backend), profile editing, and
 * password management. Data comes from the authenticated user + /auth/me/stats.
 */

import { icons } from '../icons.js';
import { authService } from '../services/authService.js';
import { showToast } from '../services/notify.js';

function initialsOf(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const first = (parts[0] || '?')[0] || '?';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
  return (first + last).toUpperCase();
}

function formatJoined(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
  } catch {
    return '—';
  }
}

function formatHours(minutes) {
  const mins = Number(minutes) || 0;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function ProfilePage() {
  const container = document.createElement('div');
  container.className = 'page-content';

  const user = authService.currentUser;
  const initials = initialsOf(user && user.name);

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <h2>Profile</h2>
        <p>Your account, identity, and personal stats.</p>
      </div>
    </div>

    <!-- Identity card -->
    <section class="card profile-identity">
      <div class="profile-avatar" aria-hidden="true">${esc(initials)}</div>
      <div class="profile-identity-body">
        <h3>${esc(user.name)}</h3>
        <p class="profile-email">${esc(user.email)}</p>
        <p class="profile-joined">Joined ${formatJoined(user.created_at)}</p>
      </div>
    </section>

    <!-- Stats -->
    <section class="grid-stats profile-stats" data-stats>
      <div class="stat-card"><div class="stat-value" data-k="study_total_minutes">—</div><div class="stat-label">Total Study Time</div></div>
      <div class="stat-card"><div class="stat-value" data-k="streak_days">—</div><div class="stat-label">Day Streak</div></div>
      <div class="stat-card"><div class="stat-value" data-k="tasks_completed">—</div><div class="stat-label">Tasks Completed</div></div>
      <div class="stat-card"><div class="stat-value" data-k="subjects_count">—</div><div class="stat-label">Subjects</div></div>
      <div class="stat-card"><div class="stat-value" data-k="notes_count">—</div><div class="stat-label">Notes</div></div>
      <div class="stat-card"><div class="stat-value" data-k="study_sessions_count">—</div><div class="stat-label">Study Sessions</div></div>
    </section>

    <div class="profile-grid">
      <!-- Edit profile -->
      <section class="card">
        <div class="card-header">
          <h3>Edit profile</h3>
          <p>Update how you appear across the app.</p>
        </div>
        <form class="profile-form" data-profile-form>
          <div class="form-field">
            <label for="profile-name">Full name</label>
            <input id="profile-name" name="name" type="text" value="${esc(user.name)}" required />
          </div>
          <div class="form-field">
            <label for="profile-avatar">Avatar URL <span class="form-hint">(optional)</span></label>
            <input id="profile-avatar" name="avatar_url" type="url" value="${esc(user.avatar_url || '')}" placeholder="https://example.com/avatar.png" />
          </div>
          <button type="submit" class="btn btn-primary">Save changes</button>
        </form>
      </section>

      <!-- Change password -->
      <section class="card">
        <div class="card-header">
          <h3>Change password</h3>
          <p>Use a strong, unique password you don't use elsewhere.</p>
        </div>
        <form class="profile-form" data-password-form>
          <div class="form-field">
            <label for="pw-current">Current password</label>
            <input id="pw-current" name="current" type="password" autocomplete="current-password" required />
          </div>
          <div class="form-field">
            <label for="pw-new">New password</label>
            <input id="pw-new" name="new" type="password" autocomplete="new-password" minlength="8" required />
            <span class="form-hint">Minimum 8 characters.</span>
          </div>
          <div class="form-field">
            <label for="pw-confirm">Confirm new password</label>
            <input id="pw-confirm" name="confirm" type="password" autocomplete="new-password" minlength="8" required />
          </div>
          <button type="submit" class="btn btn-secondary">Update password</button>
        </form>
      </section>
    </div>
  `;

  // ── Load stats ─────────────────────────────────────────────
  authService.getStats().then((stats) => {
    const root = container.querySelector('[data-stats]');
    if (!root) return;
    root.querySelector('[data-k="study_total_minutes"]').textContent = formatHours(stats.study_total_minutes);
    root.querySelector('[data-k="streak_days"]').textContent = `${stats.streak_days}d`;
    root.querySelector('[data-k="tasks_completed"]').textContent = `${stats.tasks_completed}/${stats.tasks_total}`;
    root.querySelector('[data-k="subjects_count"]').textContent = stats.subjects_count;
    root.querySelector('[data-k="notes_count"]').textContent = stats.notes_count;
    root.querySelector('[data-k="study_sessions_count"]').textContent = stats.study_sessions_count;
  }).catch(() => {
    // Stats are decorative; failures fall back to the placeholder values.
  });

  // ── Edit profile ───────────────────────────────────────────
  const profileForm = container.querySelector('[data-profile-form]');
  profileForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const btn = profileForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const updated = await authService.updateProfile({
        name: profileForm.name.value.trim(),
        avatar_url: profileForm.avatar_url.value.trim() || null,
      });
      showToast('Profile updated.', 'success');
      const avatar = container.querySelector('.profile-avatar');
      avatar.textContent = initialsOf(updated.name);
      container.querySelector('.profile-identity h3').textContent = updated.name;
    } catch (err) {
      showToast((err && err.message) || 'Could not update your profile.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // ── Change password ────────────────────────────────────────
  const passwordForm = container.querySelector('[data-password-form]');
  passwordForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = passwordForm.current.value;
    const next = passwordForm.new.value;
    const confirm = passwordForm.confirm.value;

    if (next.length < 8) {
      showToast('New password must be at least 8 characters.', 'error');
      return;
    }
    if (next !== confirm) {
      showToast('New passwords do not match.', 'error');
      return;
    }

    const btn = passwordForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await authService.changePassword(current, next);
      showToast('Password updated. Use it on your next sign in.', 'success');
      passwordForm.reset();
    } catch (err) {
      showToast((err && err.message) || 'Could not change your password.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  return container;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}