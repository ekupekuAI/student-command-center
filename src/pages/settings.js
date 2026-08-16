/**
 * settings.js — Settings & Preferences
 * Appearance (theme), study timer defaults, weekly study goal, account info +
 * sign out, and a JSON data export of everything stored on the backend.
 */

import { icons } from '../icons.js';
import { authService } from '../services/authService.js';
import { subjectService } from '../services/subjectService.js';
import { taskService } from '../services/taskService.js';
import { noteService } from '../services/noteService.js';
import { studyService } from '../services/studyService.js';
import { activityService } from '../services/activityService.js';
import { showToast } from '../services/notify.js';

const THEMES = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'settings' },
];

function currentTheme() {
  return localStorage.getItem('scc-theme') || 'light';
}

function exportJson() {
  const data = {
    exportedAt: new Date().toISOString(),
    account: authService.currentUser
      ? { id: authService.currentUser.id, name: authService.currentUser.name, email: authService.currentUser.email }
      : null,
    subjects: subjectService.getAllSubjects(),
    tasks: taskService.getAllTasks ? taskService.getAllTasks() : taskService.getTaskStats(),
    notes: noteService.getAllNotes ? noteService.getAllNotes() : [],
    studySessions: studyService.getAllSessions(),
    activities: activityService.getAllActivities ? activityService.getAllActivities() : [],
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `command-center-export-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function SettingsPage() {
  const container = document.createElement('div');
  container.className = 'page-content';

  const user = authService.currentUser;
  const timer = studyService.getTimerSettings();
  const theme = currentTheme();

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <h2>Settings</h2>
        <p>Appearance, study preferences, and your data.</p>
      </div>
    </div>

    <div class="settings-grid">
      <!-- Appearance -->
      <section class="card">
        <div class="card-header">
          <h3>Appearance</h3>
          <p>Choose how Command Center looks.</p>
        </div>
        <div class="theme-options" role="radiogroup" aria-label="Theme">
          ${THEMES.map((t) => `
            <button type="button" class="theme-option ${theme === t.value ? 'active' : ''}" data-theme-option="${t.value}" role="radio" aria-checked="${theme === t.value ? 'true' : 'false'}">
              <span class="theme-option-icon">${icons[t.icon]?.(20) || ''}</span>
              <span>${t.label}</span>
            </button>
          `).join('')}
        </div>
      </section>

      <!-- Timer defaults -->
      <section class="card">
        <div class="card-header">
          <h3>Study timer</h3>
          <p>Defaults for the focus timer in minutes.</p>
        </div>
        <form class="settings-form" data-timer-form>
          <div class="form-field">
            <label for="set-focus">Focus session</label>
            <input id="set-focus" name="focus" type="number" min="1" max="180" value="${timer.focusMinutes}" />
          </div>
          <div class="form-field">
            <label for="set-short">Short break</label>
            <input id="set-short" name="short" type="number" min="1" max="60" value="${timer.shortBreakMinutes}" />
          </div>
          <div class="form-field">
            <label for="set-long">Long break</label>
            <input id="set-long" name="long" type="number" min="1" max="90" value="${timer.longBreakMinutes}" />
          </div>
          <label class="settings-check">
            <input type="checkbox" name="autostart" ${timer.autoStart ? 'checked' : ''} />
            <span>Auto-start the next session when one finishes</span>
          </label>
          <button type="submit" class="btn btn-primary">Save timer settings</button>
        </form>
      </section>

      <!-- Weekly goal -->
      <section class="card">
        <div class="card-header">
          <h3>Weekly study goal</h3>
          <p>Hours you aim to study each week (used in Analytics).</p>
        </div>
        <form class="settings-form settings-inline" data-goal-form>
          <div class="form-field">
            <label for="set-goal">Goal (hours)</label>
            <input id="set-goal" name="goal" type="number" min="1" max="168" value="${studyService.getWeeklyGoal()}" />
          </div>
          <button type="submit" class="btn btn-secondary">Save goal</button>
        </form>
      </section>

      <!-- Account -->
      <section class="card">
        <div class="card-header">
          <h3>Account</h3>
          <p>Your signed-in identity on this device.</p>
        </div>
        <div class="settings-account">
          <div class="settings-account-row">
            <span class="settings-account-label">Name</span>
            <span>${esc(user ? user.name : '—')}</span>
          </div>
          <div class="settings-account-row">
            <span class="settings-account-label">Email</span>
            <span>${esc(user ? user.email : '—')}</span>
          </div>
        </div>
        <button type="button" class="btn btn-secondary btn-danger" data-signout>
          ${icons.chevronRight(14)} Sign out
        </button>
      </section>

      <!-- Data -->
      <section class="card">
        <div class="card-header">
          <h3>Your data</h3>
          <p>Everything in this account lives on the private backend database.</p>
        </div>
        <button type="button" class="btn btn-secondary" data-export>
          ${icons.download ? icons.download(14) : ''} Export my data (JSON)
        </button>
      </section>
    </div>
  `;

  // ── Theme ──────────────────────────────────────────────────
  container.querySelectorAll('[data-theme-option]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.themeOption;
      localStorage.setItem('scc-theme', value);
      const resolved = value === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : value;
      document.documentElement.setAttribute('data-theme', resolved);
      container.querySelectorAll('[data-theme-option]').forEach((other) => {
        const active = other === btn;
        other.classList.toggle('active', active);
        other.setAttribute('aria-checked', active ? 'true' : 'false');
      });
      showToast(`Theme set to ${value}.`, 'success');
    });
  });

  // ── Timer ──────────────────────────────────────────────────
  container.querySelector('[data-timer-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    studyService.saveTimerSettings({
      focusMinutes: form.focus.value,
      shortBreakMinutes: form.short.value,
      longBreakMinutes: form.long.value,
      autoStart: form.autostart.checked,
    });
    showToast('Timer settings saved.', 'success');
  });

  // ── Weekly goal ────────────────────────────────────────────
  container.querySelector('[data-goal-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    const hours = event.currentTarget.goal.value;
    studyService.setWeeklyGoal(hours);
    showToast('Weekly goal saved.', 'success');
  });

  // ── Sign out ───────────────────────────────────────────────
  container.querySelector('[data-signout]').addEventListener('click', () => {
    authService.logout().finally(() => {
      window.dispatchEvent(new CustomEvent('scc:signed-out'));
    });
  });

  // ── Export ─────────────────────────────────────────────────
  container.querySelector('[data-export]').addEventListener('click', () => {
    try {
      exportJson();
      showToast('Export downloaded.', 'success');
    } catch (err) {
      showToast('Could not export your data.', 'error');
    }
  });

  return container;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}