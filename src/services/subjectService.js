/**
 * subjectService.js — Subject & Course Management Service
 * Manages courses backed by the FastAPI API. Pages keep using the same
 * synchronous read API (filter/sort/stats); data is loaded from the backend
 * and cached in-memory, with a localStorage fallback when offline.
 *
 * Writes are async and go to the backend only — a failed save throws a
 * user-facing error and is never reported as a success.
 */

import { apiClient } from './apiClient.js';
import { storage } from './storage.js';
import { subjectToApi, subjectToUi } from './mappers.js';

const STORAGE_KEY = 'subjects';

export const SUBJECT_COLOR_OPTIONS = [
  { value: 'violet', label: 'Violet', hex: 'hsl(270, 70%, 58%)' },
  { value: 'blue',   label: 'Blue',   hex: 'hsl(215, 80%, 55%)' },
  { value: 'cyan',   label: 'Cyan',   hex: 'hsl(185, 75%, 45%)' },
  { value: 'green',  label: 'Green',  hex: 'hsl(152, 65%, 45%)' },
  { value: 'yellow', label: 'Yellow', hex: 'hsl(42, 90%, 50%)'  },
  { value: 'orange', label: 'Orange', hex: 'hsl(25, 88%, 55%)'  },
  { value: 'red',    label: 'Red',    hex: 'hsl(355, 78%, 58%)' },
  { value: 'pink',   label: 'Pink',   hex: 'hsl(328, 72%, 60%)' },
];

/**
 * Semester option helpers — semesters are derived from the current
 * date instead of being hard-coded, so the list stays maintainable
 * over time. Existing stored subjects remain valid because
 * getSemesters() always merges stored semester values back in.
 */

/** Approximate date of a semester label (e.g. "Fall 2026") for sorting */
function semesterDate(label) {
  const [season, year] = String(label || '').split(' ');
  const y = parseInt(year, 10) || new Date().getFullYear();
  const month = season === 'Spring' ? 1 : season === 'Summer' ? 5 : 8;
  return new Date(y, month, 1);
}

/** Most relevant upcoming/current semester for the given date */
function currentSemesterLabel(now) {
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 7) return `Fall ${year}`;
  if (month >= 5) return `Summer ${year}`;
  return `Spring ${year}`;
}

function buildSemesterOptions() {
  const now = new Date();
  const year = now.getFullYear();
  const current = currentSemesterLabel(now);

  const candidates = [];
  for (let y = year - 1; y <= year + 1; y++) {
    candidates.push(`Spring ${y}`, `Summer ${y}`, `Fall ${y}`);
  }

  const ordered = candidates.sort((a, b) => semesterDate(b) - semesterDate(a));
  const rest = ordered.filter(s => s !== current);
  rest.unshift(current);
  return rest;
}

export const SEMESTER_OPTIONS = buildSemesterOptions();

function clampProgress(value) {
  return Math.min(100, Math.max(0, parseInt(value, 10) || 0));
}

class SubjectService {
  constructor() {
    this._subscribers = new Set();
    this._cache = null;
    this._source = null;
  }

  /**
   * (Re)load subjects from the backend. Falls back to the local snapshot
   * when the server is unreachable so pages never show a blank screen.
   */
  async refresh() {
    try {
      const data = await apiClient.get('/subjects');
      this._cache = (Array.isArray(data) ? data : []).map(subjectToUi);
      this._source = 'api';
    } catch (err) {
      if (err && err.offline) {
        const local = storage.get(STORAGE_KEY, []);
        this._cache = (Array.isArray(local) ? local : []).map(subjectToUi);
        this._source = 'local';
      } else {
        this._cache = this._cache || [];
        this._source = 'api';
      }
    }
    this._notify();
  }

  _ensureLoaded() {
    if (this._cache === null) {
      this._cache = [];
      this.refresh();
    }
  }

  /** Get all registered subjects */
  getAllSubjects() {
    this._ensureLoaded();
    return this._cache || [];
  }

  /** Get a single subject by ID */
  getSubjectById(id) {
    const subjects = this.getAllSubjects();
    return subjects.find(s => s.id === id) || null;
  }

  /**
   * Filter and sort subjects
   * @param {Object} options
   * @param {string} [options.search]
   * @param {string} [options.semester] - 'all' | semester string
   * @param {string} [options.sortBy] - 'name_asc' | 'code_asc' | 'progress_desc' | 'credits_desc'
   */
  getFilteredSubjects(options = {}) {
    const {
      search = '',
      semester = 'all',
      sortBy = 'code_asc',
    } = options;

    let list = this.getAllSubjects();

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.instructor && s.instructor.toLowerCase().includes(q))
      );
    }

    if (semester !== 'all') {
      list = list.filter(s => s.semester === semester);
    }

    list.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'code_asc':
          return a.code.localeCompare(b.code);
        case 'progress_desc':
          return (b.progress || 0) - (a.progress || 0);
        case 'progress_asc':
          return (a.progress || 0) - (b.progress || 0);
        case 'credits_desc':
          return (b.credits || 0) - (a.credits || 0);
        default:
          return a.code.localeCompare(b.code);
      }
    });

    return list;
  }

  /** Create a new subject via the API */
  async createSubject(data) {
    const name = (data.name || '').trim();
    const code = (data.code || '').trim().toUpperCase();

    if (!name) throw new Error('Subject name is required.');
    if (!code) throw new Error('Subject code is required.');

    const created = await apiClient.post('/subjects', subjectToApi({
      ...data,
      name,
      code,
      credits: Math.max(1, parseInt(data.credits, 10) || 3),
      progress: clampProgress(data.progress),
      grade: data.grade || 'In Progress',
    }));
    const ui = subjectToUi(created);
    this._cache = [...(this._cache || []), ui];
    this._notify();
    return ui;
  }

  /** Update an existing subject via the API */
  async updateSubject(id, updates) {
    const current = this.getSubjectById(id);
    if (!current) throw new Error(`Subject with id ${id} not found.`);

    const color = updates.color || updates.accent || current.color;
    const payload = {};
    if (updates.name !== undefined) payload.name = String(updates.name).trim();
    if (updates.code !== undefined) payload.code = String(updates.code).trim().toUpperCase();
    if (updates.instructor !== undefined) payload.instructor = String(updates.instructor).trim();
    if (updates.credits !== undefined) payload.credits = Math.max(1, parseInt(updates.credits, 10) || 1);
    if (updates.semester !== undefined) payload.semester = String(updates.semester);
    if (updates.grade !== undefined) payload.grade = String(updates.grade).trim() || 'In Progress';
    if (updates.progress !== undefined) payload.progress = clampProgress(updates.progress);
    if (updates.color !== undefined || updates.accent !== undefined) {
      payload.color = color;
      payload.accent = color;
    }

    const updated = await apiClient.patch(`/subjects/${id}`, payload);
    const ui = subjectToUi(updated);
    this._cache = (this._cache || []).map(s => (s.id === id ? ui : s));
    this._notify();
    return ui;
  }

  /** Update a subject's progress percentage directly */
  updateSubjectProgress(id, progress) {
    return this.updateSubject(id, { progress: clampProgress(progress) });
  }

  /** Delete a subject via the API */
  async deleteSubject(id) {
    await apiClient.delete(`/subjects/${id}`);
    this._cache = (this._cache || []).filter(s => s.id !== id);
    this._notify();
    return true;
  }

  /** Get unique semester list */
  getSemesters() {
    const subjects = this.getAllSubjects();
    const set = new Set(subjects.map(s => s.semester).filter(Boolean));
    SEMESTER_OPTIONS.forEach(sem => set.add(sem));
    return Array.from(set);
  }

  /** Calculate summary statistics for subjects */
  getSubjectStats() {
    const subjects = this.getAllSubjects();
    const total = subjects.length;
    const totalCredits = subjects.reduce((sum, s) => sum + (s.credits || 0), 0);
    const avgProgress = total > 0
      ? Math.round(subjects.reduce((sum, s) => sum + (s.progress || 0), 0) / total)
      : 0;

    const semesters = new Set(subjects.map(s => s.semester)).size;

    return {
      total,
      totalCredits,
      avgProgress,
      semesters,
    };
  }

  /** Subscribe to subject data updates */
  subscribe(callback) {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  _notify() {
    for (const callback of this._subscribers) {
      try {
        callback();
      } catch (err) {
        console.error('[SubjectService] Subscriber error:', err);
      }
    }
  }
}

export const subjectService = new SubjectService();