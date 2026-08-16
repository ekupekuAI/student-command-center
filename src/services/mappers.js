/**
 * mappers.js — API ↔ UI field mapping
 *
 * The FastAPI backend uses snake_case fields (subject_id, due_date, ...) and
 * the UI uses camelCase (subjectId, dueDate, ...). These mappers translate
 * between the two shapes at the service layer so pages keep working untouched.
 *
 * `status` is the single source of truth for task completion; `done` is
 * derived and never sent to the backend.
 */

/* ── Subjects ───────────────────────────────────────────────── */

export function subjectToUi(s) {
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    instructor: s.instructor || 'TBA',
    credits: s.credits ?? 3,
    semester: s.semester || 'Fall 2026',
    color: s.color || 'violet',
    accent: s.accent || s.color || 'violet',
    progress: s.progress ?? 0,
    grade: s.grade || 'In Progress',
  };
}

export function subjectToApi(d) {
  return {
    code: d.code,
    name: d.name,
    instructor: d.instructor || 'TBA',
    credits: d.credits ?? 3,
    semester: d.semester || 'Fall 2026',
    color: d.color || 'violet',
    accent: d.accent || d.color || 'violet',
    progress: d.progress ?? 0,
    grade: d.grade || 'In Progress',
  };
}

/* ── Tasks ──────────────────────────────────────────────────── */

export function taskToUi(t) {
  const status = (t.status && ['todo', 'in_progress', 'completed'].includes(t.status))
    ? t.status
    : (t.done ? 'completed' : 'todo');
  return {
    id: t.id,
    title: t.title,
    description: t.description || '',
    subjectId: t.subject_id || null,
    priority: t.priority || 'medium',
    status,
    dueDate: t.due_date || null,
    createdDate: t.created_at || null,
    updatedAt: t.updated_at || null,
    estimatedMinutes: t.estimated_minutes ?? null,
    done: status === 'completed',
  };
}

export function taskToApi(d) {
  return {
    title: d.title,
    description: d.description || '',
    subject_id: d.subjectId || null,
    priority: d.priority || 'medium',
    status: d.status || 'todo',
    due_date: d.dueDate || null,
    estimated_minutes: d.estimatedMinutes ?? null,
  };
}

/* ── Notes ──────────────────────────────────────────────────── */

export function noteToUi(n) {
  return {
    id: n.id,
    title: n.title,
    content: n.content || '',
    subjectId: n.subject_id || null,
    createdAt: n.created_at || null,
    updatedAt: n.updated_at || null,
    pinned: Boolean(n.pinned),
  };
}

export function noteToApi(d) {
  return {
    title: d.title,
    content: d.content || '',
    subject_id: d.subjectId || null,
    pinned: Boolean(d.pinned),
  };
}

/* ── Study sessions ─────────────────────────────────────────── */

export function sessionToUi(s) {
  return {
    id: s.id,
    subjectId: s.subject_id || null,
    durationMinutes: s.duration_minutes,
    startedAt: s.started_at || null,
    completedAt: s.completed_at || null,
    sessionType: s.session_type || 'focus',
    completed: Boolean(s.completed),
    notes: s.notes || '',
    createdAt: s.created_at || null,
  };
}

export function sessionToApi(d) {
  return {
    subject_id: d.subjectId || null,
    duration_minutes: d.durationMinutes,
    started_at: d.startedAt || null,
    completed_at: d.completedAt || null,
    session_type: d.sessionType || 'focus',
    completed: d.completed !== false,
    notes: d.notes || '',
  };
}

/* ── Activities ─────────────────────────────────────────────── */

export function activityToUi(a) {
  return {
    id: a.id,
    type: a.type,
    label: a.label,
    text: a.text,
    accent: a.accent || 'blue',
    timestamp: a.timestamp,
  };
}