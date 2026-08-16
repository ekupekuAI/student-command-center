/**
 * migrationService.js — One-time localStorage → backend migration
 *
 * On first backend-enabled startup, if legacy local data exists (scc_tasks,
 * scc_subjects, scc_notes, scc_study_sessions, scc_activities), the user is
 * asked to explicitly confirm an upload. The upload is idempotent:
 *
 *   - A mapping of {localId → serverId} is persisted after every record, so an
 *     interrupted migration can be retried without creating duplicates.
 *   - Uploads carry the X-Migration header so the backend does not also log
 *     activity for the imported records.
 *   - After uploading, the backend lists are re-fetched and every mapped record
 *     is verified to exist before migration is marked complete.
 *   - Local data is NEVER deleted. Only the completion flag is set locally.
 *
 * Theme, sidebar and timer preferences are intentionally not migrated.
 */

import { apiClient, MIGRATION_HEADER } from './apiClient.js';
import { storage } from './storage.js';
import { subjectToApi, taskToApi, noteToApi, sessionToApi } from './mappers.js';
import { showToast, showErrorToast } from './notify.js';
import { subjectService } from './subjectService.js';
import { taskService } from './taskService.js';
import { noteService } from './noteService.js';
import { studyService } from './studyService.js';
import { activityService } from './activityService.js';

const COMPLETED_KEY = 'migration_completed';
const DECLINED_KEY = 'migration_declined';
const MAP_KEY = 'migration_map';

const COLLECTIONS = {
  subjects: { key: 'subjects', serverPath: '/subjects', mapKey: 'subjects' },
  tasks:    { key: 'tasks',    serverPath: '/tasks',    mapKey: 'tasks' },
  notes:    { key: 'notes',    serverPath: '/notes',    mapKey: 'notes' },
  sessions: { key: 'study_sessions', serverPath: '/study-sessions', mapKey: 'sessions' },
  activities: { key: 'activities', serverPath: '/activities', mapKey: 'activities' },
};

/* ── Local record validation & payload building ────────────── */

function cleanString(value, max) {
  const s = String(value == null ? '' : value).trim();
  return s.slice(0, max || 1000);
}

function isValidSubject(s) {
  return s && typeof s === 'object' && cleanString(s.id) && cleanString(s.name) && cleanString(s.code);
}

function isValidTask(t) {
  return t && typeof t === 'object' && cleanString(t.id) && cleanString(t.title);
}

function isValidNote(n) {
  return n && typeof n === 'object' && cleanString(n.id) && cleanString(n.title) && cleanString(n.content, 20000);
}

function isValidSession(s) {
  return s && typeof s === 'object' && cleanString(s.id)
    && Number.isFinite(parseInt(s.durationMinutes, 10))
    && cleanString(s.startedAt);
}

function isValidActivity(a) {
  return a && typeof a === 'object' && cleanString(a.id) && cleanString(a.type) && cleanString(a.text);
}

function subjectPayload(s) {
  return subjectToApi({
    code: cleanString(s.code, 20),
    name: cleanString(s.name, 120),
    instructor: cleanString(s.instructor, 120) || 'TBA',
    credits: Math.max(1, parseInt(s.credits, 10) || 3),
    semester: cleanString(s.semester, 40) || 'Fall 2026',
    color: cleanString(s.color, 20) || 'violet',
    accent: cleanString(s.accent, 20) || cleanString(s.color, 20) || 'violet',
    progress: Math.min(100, Math.max(0, parseInt(s.progress, 10) || 0)),
    grade: cleanString(s.grade, 20) || 'In Progress',
  });
}

function taskPayload(t, subjectId) {
  const status = ['todo', 'in_progress', 'completed'].includes(t.status) ? t.status : 'todo';
  return taskToApi({
    title: cleanString(t.title, 200),
    description: cleanString(t.description, 10000),
    subjectId,
    priority: ['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium',
    status,
    dueDate: t.dueDate || null,
    estimatedMinutes: t.estimatedMinutes ? Math.max(1, parseInt(t.estimatedMinutes, 10)) : null,
  });
}

function notePayload(n, subjectId) {
  return noteToApi({
    title: cleanString(n.title, 200),
    content: cleanString(n.content, 20000),
    subjectId,
    pinned: Boolean(n.pinned),
  });
}

function sessionPayload(s, subjectId) {
  return sessionToApi({
    subjectId,
    durationMinutes: Math.max(1, parseInt(s.durationMinutes, 10) || 25),
    startedAt: s.startedAt || null,
    completedAt: s.completedAt || null,
    sessionType: ['focus', 'short_break', 'long_break'].includes(s.sessionType) ? s.sessionType : 'focus',
    completed: s.completed !== false,
    notes: cleanString(s.notes, 10000),
  });
}

function activityPayload(a) {
  const timestamp = a.timestamp
    ? (typeof a.timestamp === 'number' ? new Date(a.timestamp).toISOString() : a.timestamp)
    : undefined;
  return {
    type: cleanString(a.type, 30),
    label: cleanString(a.label, 60),
    text: cleanString(a.text, 2000),
    accent: cleanString(a.accent, 20) || 'blue',
    ...(timestamp ? { timestamp } : {}),
  };
}

/* ── State helpers ─────────────────────────────────────────── */

export function isMigrationCompleted() {
  return storage.get(COMPLETED_KEY) === 'true';
}

export function isMigrationDeclined() {
  return storage.get(DECLINED_KEY) === 'true';
}

function loadMap() {
  return storage.get(MAP_KEY, {}) || {};
}

function saveMap(map) {
  storage.set(MAP_KEY, map);
}

function getLocalCollection(key) {
  const raw = storage.get(key, []);
  return Array.isArray(raw) ? raw : [];
}

/**
 * Count valid + malformed records for each collection.
 */
export function detectLocalData() {
  const counts = {};
  let total = 0;
  let malformed = 0;

  for (const [name, cfg] of Object.entries(COLLECTIONS)) {
    const list = getLocalCollection(cfg.key);
    const valid = list.filter(isValidFor(name));
    counts[name] = { raw: list.length, valid: valid.length, skipped: list.length - valid.length };
    total += valid.length;
    malformed += list.length - valid.length;
  }

  return { counts, totalValid: total, malformed, hasData: total > 0 };
}

function isValidFor(name) {
  switch (name) {
    case 'subjects': return isValidSubject;
    case 'tasks': return isValidTask;
    case 'notes': return isValidNote;
    case 'sessions': return isValidSession;
    case 'activities': return isValidActivity;
    default: return () => false;
  }
}

/* ── Upload ────────────────────────────────────────────────── */

async function postWithRetryless(path, body) {
  // Migration uploads must not create backend activity duplicates.
  return apiClient.post(path, body, { headers: MIGRATION_HEADER });
}

function resolveSubjectServerId(localSubjectId, subjectMap, migratedSubjectIds) {
  if (!localSubjectId) return null;
  if (subjectMap[localSubjectId]) return subjectMap[localSubjectId];
  // Subject was referenced locally but wasn't (re)uploaded this run.
  if (migratedSubjectIds && migratedSubjectIds.has(localSubjectId)) return null;
  return null;
}

/**
 * Run the migration. Never throws for recoverable per-record problems; only
 * network failure aborts. Returns a structured result.
 */
export async function runMigration() {
  if (isMigrationCompleted()) return { status: 'skipped' };

  const healthy = await apiClient.checkHealth();
  if (!healthy) return { status: 'offline', message: 'Backend is unreachable; migration postponed.' };

  const map = loadMap();
  const result = {
    status: 'ok',
    uploaded: {},
    skipped: {},
    failures: [],
    verified: {},
    missing: {},
  };

  try {
    // 1. Subjects first (children depend on their server ids).
    const subjects = getLocalCollection('subjects').filter(isValidSubject);
    for (const s of subjects) {
      if (map.subjects && map.subjects[s.id]) continue;
      try {
        const created = await postWithRetryless('/subjects', subjectPayload(s));
        map.subjects = map.subjects || {};
        map.subjects[s.id] = created.id;
        saveMap(map);
        result.uploaded.subjects = (result.uploaded.subjects || 0) + 1;
      } catch (err) {
        if (err && err.offline) throw err;
        result.skipped.subjects = (result.skipped.subjects || 0) + 1;
        result.failures.push(`subject "${cleanString(s.name)}": ${err.message}`);
      }
    }

    const subjectMap = map.subjects || {};

    // 2. Tasks
    const tasks = getLocalCollection('tasks').filter(isValidTask);
    for (const t of tasks) {
      if (map.tasks && map.tasks[t.id]) continue;
      const serverSubjectId = resolveSubjectServerId(t.subjectId, subjectMap);
      try {
        const created = await postWithRetryless('/tasks', taskPayload(t, serverSubjectId));
        map.tasks = map.tasks || {};
        map.tasks[t.id] = created.id;
        saveMap(map);
        result.uploaded.tasks = (result.uploaded.tasks || 0) + 1;
      } catch (err) {
        if (err && err.offline) throw err;
        result.skipped.tasks = (result.skipped.tasks || 0) + 1;
        result.failures.push(`task "${cleanString(t.title)}": ${err.message}`);
      }
    }

    // 3. Notes
    const notes = getLocalCollection('notes').filter(isValidNote);
    for (const n of notes) {
      if (map.notes && map.notes[n.id]) continue;
      const serverSubjectId = resolveSubjectServerId(n.subjectId, subjectMap);
      try {
        const created = await postWithRetryless('/notes', notePayload(n, serverSubjectId));
        map.notes = map.notes || {};
        map.notes[n.id] = created.id;
        saveMap(map);
        result.uploaded.notes = (result.uploaded.notes || 0) + 1;
      } catch (err) {
        if (err && err.offline) throw err;
        result.skipped.notes = (result.skipped.notes || 0) + 1;
        result.failures.push(`note "${cleanString(n.title)}": ${err.message}`);
      }
    }

    // 4. Study sessions
    const sessions = getLocalCollection('study_sessions').filter(isValidSession);
    for (const s of sessions) {
      if (map.sessions && map.sessions[s.id]) continue;
      const serverSubjectId = resolveSubjectServerId(s.subjectId, subjectMap);
      try {
        const created = await postWithRetryless('/study-sessions', sessionPayload(s, serverSubjectId));
        map.sessions = map.sessions || {};
        map.sessions[s.id] = created.id;
        saveMap(map);
        result.uploaded.sessions = (result.uploaded.sessions || 0) + 1;
      } catch (err) {
        if (err && err.offline) throw err;
        result.skipped.sessions = (result.skipped.sessions || 0) + 1;
        result.failures.push(`study session "${cleanString(s.startedAt)}": ${err.message}`);
      }
    }

    // 5. Activities
    const activities = getLocalCollection('activities').filter(isValidActivity);
    for (const a of activities) {
      if (map.activities && map.activities[a.id]) continue;
      try {
        const created = await postWithRetryless('/activities', activityPayload(a));
        map.activities = map.activities || {};
        map.activities[a.id] = created.id;
        saveMap(map);
        result.uploaded.activities = (result.uploaded.activities || 0) + 1;
      } catch (err) {
        if (err && err.offline) throw err;
        result.skipped.activities = (result.skipped.activities || 0) + 1;
        result.failures.push(`activity "${cleanString(a.text)}": ${err.message}`);
      }
    }

    // 3. Verify every mapped record exists server-side.
    for (const [name, cfg] of Object.entries(COLLECTIONS)) {
      const mappedIds = Object.values((map[cfg.mapKey] || {}));
      result.verified[name] = mappedIds.length;
      if (mappedIds.length === 0) continue;
      const list = await apiClient.get(cfg.serverPath);
      const serverIds = new Set((list || []).map(item => item.id));
      const missing = mappedIds.filter(serverId => !serverIds.has(serverId));
      result.missing[name] = missing.length;
    }

    const anyMissing = Object.values(result.missing).some(count => count > 0);
    if (anyMissing) {
      result.status = 'partial';
      return result;
    }

    storage.set(COMPLETED_KEY, 'true');
    storage.remove(DECLINED_KEY);

    // Refresh all services so the UI reflects migrated data.
    await Promise.all([
      subjectService.refresh(),
      taskService.refresh(),
      noteService.refresh(),
      studyService.refreshSessions(),
      activityService.refresh(),
    ]);

    return result;
  } catch (err) {
    if (err && err.offline) {
      return { status: 'offline', message: 'Lost connection during migration. Run it again — already-uploaded records will be skipped.' };
    }
    return { status: 'error', message: err.message };
  }
}

/* ── Prompt UI ─────────────────────────────────────────────── */

function buildPromptModal({ counts, totalValid, onConfirm, onSkip }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const rows = Object.entries(counts)
    .map(([name, c]) => c.valid > 0
      ? `<div class="migration-row"><span>${labelFor(name)}</span><strong>${c.valid}</strong></div>`
      : '')
    .filter(Boolean)
    .join('');

  overlay.innerHTML = `
    <div class="modal-dialog modal-dialog-sm">
      <div class="modal-header">
        <h3 class="modal-title">Sync local data to server?</h3>
      </div>
      <div class="modal-body" style="padding: var(--space-4) var(--space-6)">
        <p style="font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.5; margin-bottom: var(--space-4)">
          This device has <strong>${totalValid}</strong> local records saved in the browser.
          Upload them to your backend so they stay synced? Your local copies are never deleted.
        </p>
        <div class="migration-list">${rows}</div>
        <p style="font-size: var(--text-xs); color: var(--text-tertiary); line-height: 1.5; margin-top: var(--space-3)">
          Theme, sidebar, and timer preferences stay on this device and are not uploaded.
        </p>
      </div>
      <div class="modal-footer" style="padding: var(--space-4) var(--space-6) var(--space-5)">
        <button type="button" class="btn btn-secondary" id="migrationSkipBtn">Not now</button>
        <button type="button" class="btn btn-primary" id="migrationConfirmBtn">
          Upload ${totalValid} records
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  function close() {
    overlay.classList.add('modal-closing');
    setTimeout(() => overlay.remove(), 180);
  }

  overlay.querySelector('#migrationSkipBtn')?.addEventListener('click', () => {
    storage.set(DECLINED_KEY, 'true');
    close();
    onSkip?.();
  });

  const confirmBtn = overlay.querySelector('#migrationConfirmBtn');
  confirmBtn?.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Uploading…';
    const result = await onConfirm();
    if (result && result.status === 'ok') {
      close();
      showToast('Local data successfully synced to the server.', 'success', 5200);
    } else if (result && (result.status === 'partial' || result.status === 'error' || result.status === 'offline')) {
      close();
      showErrorToast({
        message: (result.message)
          || `Migration incomplete — some records were not verified. Your local data is kept; you can try again.`,
      });
    } else {
      close();
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      storage.set(DECLINED_KEY, 'true');
      close();
      onSkip?.();
    }
  });
}

function labelFor(name) {
  return {
    subjects: 'Courses',
    tasks: 'Tasks',
    notes: 'Notes',
    sessions: 'Study sessions',
    activities: 'Activity entries',
  }[name] || name;
}

/**
 * Entry point called once at app bootstrap. Shows the confirmation prompt if
 * there is local data to migrate, the backend is reachable, and migration has
 * not been completed or explicitly declined.
 */
export async function runMigrationCheck() {
  if (isMigrationCompleted() || isMigrationDeclined()) return;

  const detected = detectLocalData();
  if (!detected.hasData) return;

  const healthy = await apiClient.checkHealth();
  if (!healthy) return;

  buildPromptModal({
    counts: detected.counts,
    totalValid: detected.totalValid,
    onConfirm: runMigration,
  });
}