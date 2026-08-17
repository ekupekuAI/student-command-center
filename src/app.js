/**
 * app.js — Main Application Bootstrap
 * Handles the auth gate, initializes the shell + router once authenticated,
 * and starts the hash router. Services are warmed up after login; the one-time
 * local→server migration is offered if needed; the shell shows an offline
 * banner when the backend is unreachable.
 */

import { createShell } from './shell.js';
import { Router } from './router.js';
import { AuthPage, setAuthSwitchHandler } from './pages/auth.js';
import {
  DashboardPage,
  SubjectsPage,
  TasksPage,
  StudyPage,
  NotesPage,
  AnalyticsPage,
  AIPage,
  ProfilePage,
  SettingsPage,
  AdminPage,
} from './pages/index.js';
import { subjectService } from './services/subjectService.js';
import { taskService } from './services/taskService.js';
import { noteService } from './services/noteService.js';
import { studyService } from './services/studyService.js';
import { activityService } from './services/activityService.js';
import { authService } from './services/authService.js';
import tokenStore from './services/tokenStore.js';
import { musicService } from './services/musicService.js';
import { runMigrationCheck } from './services/migrationService.js';

let shell = null;
let router = null;

// ── Authenticated app ─────────────────────────────────────────
function mountApp() {
  clearApp();

  const user = authService.currentUser;
  const isAdminRole = user && user.role === 'admin';

  shell = createShell();
  router = new Router({
    outlet: shell.outlet,
    onNavigate: (path) => {
      shell.updateActiveNav(path);
    },
  });

  if (isAdminRole) {
    // Admins only get the management console — no student tabs or pages.
    router
      .register('#/dashboard', AdminPage)
      .register('#/admin', AdminPage);
  } else {
    router
      .register('#/dashboard', DashboardPage)
      .register('#/subjects',  SubjectsPage)
      .register('#/tasks',     TasksPage)
      .register('#/study',     StudyPage)
      .register('#/notes',     NotesPage)
      .register('#/analytics', AnalyticsPage)
      .register('#/ai',        AIPage)
      .register('#/profile',   ProfilePage)
      .register('#/settings',  SettingsPage)
      .register('#/admin', AdminPage);
  }

  router.start();

  // Backend warmup & one-time migration (only after auth).
  (async function bootstrap() {
    try {
      await Promise.all([
        subjectService.refresh(),
        taskService.refresh(),
        noteService.refresh(),
        studyService.refreshSessions(),
        activityService.refresh(),
      ]);
      await runMigrationCheck();
    } catch (err) {
      // Warmup failures are surfaced per-service; never block the app shell.
      console.error('[Bootstrap] Warmup issue:', err);
    }
  })();
}

// ── Auth screen ───────────────────────────────────────────────
function mountAuth(mode = 'login') {
  clearApp();
  musicService.stop();
  const page = AuthPage({ onSuccess: mountApp, initialMode: mode });
  document.body.appendChild(page);
}

function clearApp() {
  document.body.innerHTML = '';
}

// ── Boot ──────────────────────────────────────────────────────
function boot() {
  if (tokenStore.hasToken()) {
    mountApp();
    // Validate the stored token in the background; bounce to auth on failure.
    authService.fetchMe().catch((err) => {
      if (err && err.status === 401) mountAuth();
    });
  } else {
    mountAuth();
  }
}

setAuthSwitchHandler((currentMode) => {
  // Toggle between the sign-in and create-account forms.
  mountAuth(currentMode === 'login' ? 'register' : 'login');
});

// Any 401 on a protected endpoint (expired / revoked token) returns here.
window.addEventListener('scc:unauthorized', () => {
  authService.logout().finally(mountAuth);
});

// Explicit "Sign out" from the shell.
window.addEventListener('scc:signed-out', mountAuth);

boot();