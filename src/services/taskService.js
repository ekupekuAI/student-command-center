/**
 * taskService.js — Task Data & Service Layer
 * Central source of truth for all task operations, backed by the FastAPI API.
 * Reads are synchronous against an in-memory cache (loaded from the backend),
 * writes are async and authoritative on the server.
 *
 * `status` remains the single source of truth for completion; `done` is always
 * derived and never sent to the backend. Activity entries are created by the
 * backend — the frontend never writes duplicate activity records.
 */

import { apiClient } from './apiClient.js';
import { storage } from './storage.js';
import { taskToApi, taskToUi } from './mappers.js';
import { activityService } from './activityService.js';

const STORAGE_KEY = 'tasks';

export const PRIORITY_OPTIONS = [
  { value: 'high',   label: 'High',   accent: 'error' },
  { value: 'medium', label: 'Medium', accent: 'warning' },
  { value: 'low',    label: 'Low',    accent: 'neutral' },
];

export const STATUS_OPTIONS = [
  { value: 'todo',        label: 'To Do',       accent: 'neutral' },
  { value: 'in_progress', label: 'In Progress', accent: 'brand' },
  { value: 'completed',   label: 'Completed',   accent: 'success' },
];

/**
 * Normalize a task's completion state so `status` is the single
 * source of truth and `done` is always derived from it.
 */
function normalizeTask(task) {
  if (!task) return task;
  const status = STATUS_OPTIONS.some(o => o.value === task.status)
    ? task.status
    : (task.done ? 'completed' : 'todo');
  return { ...task, status, done: status === 'completed' };
}

class TaskService {
  constructor() {
    this._subscribers = new Set();
    this._cache = null;
    this._source = null;
  }

  /** (Re)load tasks from the backend (localStorage fallback when offline). */
  async refresh() {
    try {
      const data = await apiClient.get('/tasks');
      this._cache = (Array.isArray(data) ? data : []).map(taskToUi);
      this._source = 'api';
    } catch (err) {
      if (err && err.offline) {
        const local = storage.get(STORAGE_KEY, []);
        this._cache = (Array.isArray(local) ? local : []).map(taskToUi).map(normalizeTask);
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

  /** Get all tasks */
  getAllTasks() {
    this._ensureLoaded();
    return (this._cache || []).map(normalizeTask);
  }

  /** Get a single task by ID */
  getTaskById(id) {
    const tasks = this.getAllTasks();
    return tasks.find(t => t.id === id) || null;
  }

  /**
   * Filter and sort tasks based on options
   * @param {Object} options
   * @param {string} [options.search]
   * @param {string} [options.status] - 'all' | 'todo' | 'in_progress' | 'completed'
   * @param {string} [options.priority] - 'all' | 'high' | 'medium' | 'low'
   * @param {string} [options.subjectId] - 'all' | subject id
   * @param {string} [options.sortBy] - 'due_asc' | 'due_desc' | 'priority_desc' | 'priority_asc' | 'created_desc' | 'title_asc'
   */
  getFilteredTasks(options = {}) {
    const {
      search = '',
      status = 'all',
      priority = 'all',
      subjectId = 'all',
      sortBy = 'due_asc',
    } = options;

    let list = this.getAllTasks();

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

    if (status !== 'all') {
      list = list.filter(t => t.status === status);
    }

    if (priority !== 'all') {
      list = list.filter(t => t.priority === priority);
    }

    if (subjectId !== 'all') {
      list = list.filter(t => t.subjectId === subjectId);
    }

    const priorityWeight = { high: 3, medium: 2, low: 1 };

    list.sort((a, b) => {
      if (a.done !== b.done) {
        return a.done ? 1 : -1;
      }

      switch (sortBy) {
        case 'due_asc':
          return (a.dueDate || '').localeCompare(b.dueDate || '');
        case 'due_desc':
          return (b.dueDate || '').localeCompare(a.dueDate || '');
        case 'priority_desc':
          return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        case 'priority_asc':
          return (priorityWeight[a.priority] || 0) - (priorityWeight[b.priority] || 0);
        case 'created_desc':
          return (b.createdDate || '').localeCompare(a.createdDate || '');
        case 'title_asc':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return list;
  }

  /** Create a new task via the API */
  async createTask(data) {
    const title = (data.title || '').trim();
    if (!title) throw new Error('Task title is required.');
    if (!data.dueDate) throw new Error('Due date is required.');

    const status = data.status || 'todo';
    const created = await apiClient.post('/tasks', taskToApi({
      title,
      description: (data.description || '').trim(),
      subjectId: data.subjectId || null,
      priority: data.priority || 'medium',
      status,
      dueDate: data.dueDate,
      estimatedMinutes: data.estimatedMinutes ? Math.max(1, parseInt(data.estimatedMinutes, 10)) : null,
    }));
    const ui = taskToUi(created);
    this._cache = [ui, ...(this._cache || [])];
    this._notify();
    activityService.refresh();
    return ui;
  }

  /**
   * Update an existing task via the API.
   * `status` is the single source of truth for completion; `done` is always
   * derived from it.
   */
  async updateTask(id, updates) {
    const current = this.getTaskById(id);
    if (!current) throw new Error(`Task with id ${id} not found.`);

    let status = current.status || 'todo';
    if (updates.status !== undefined) {
      status = STATUS_OPTIONS.some(o => o.value === updates.status)
        ? updates.status
        : current.status;
    }
    if (updates.done !== undefined && updates.status === undefined) {
      status = updates.done ? 'completed' : (status === 'completed' ? 'todo' : status);
    }

    const payload = {};
    if (updates.title !== undefined) payload.title = String(updates.title).trim();
    if (updates.description !== undefined) payload.description = String(updates.description).trim();
    if (updates.subjectId !== undefined) payload.subject_id = updates.subjectId || null;
    if (updates.priority !== undefined) payload.priority = updates.priority;
    if (updates.dueDate !== undefined) payload.due_date = updates.dueDate || null;
    if (updates.estimatedMinutes !== undefined) {
      payload.estimated_minutes = updates.estimatedMinutes
        ? Math.max(1, parseInt(updates.estimatedMinutes, 10))
        : null;
    }
    if (updates.status !== undefined || updates.done !== undefined) {
      payload.status = status;
    }

    const updated = await apiClient.patch(`/tasks/${id}`, payload);
    const ui = taskToUi(updated);
    this._cache = (this._cache || []).map(t => (t.id === id ? ui : t));
    this._notify();
    activityService.refresh();
    return ui;
  }

  /** Toggle task completion status (status becomes authoritative) */
  toggleTaskCompletion(id) {
    const task = this.getTaskById(id);
    if (!task) return null;

    const willBeDone = !task.done;
    return this.updateTask(id, {
      done: willBeDone,
      status: willBeDone ? 'completed' : 'todo',
    });
  }

  /** Set task status directly */
  setTaskStatus(id, status) {
    const isDone = status === 'completed';
    return this.updateTask(id, { status, done: isDone });
  }

  /**
   * Compatibility hook kept for callers that previously unassigned tasks
   * client-side. With the backend, subject deletion already sets linked
   * tasks' subject_id to NULL atomically (FK ON DELETE SET NULL), so the
   * frontend no longer needs to do anything.
   * @returns {Promise<boolean>}
   */
  async unassignTasksForSubject() {
    await this.refresh();
    return false;
  }

  /** Delete a task via the API */
  async deleteTask(id) {
    const taskToDelete = this.getTaskById(id);
    if (!taskToDelete) return false;

    await apiClient.delete(`/tasks/${id}`);
    this._cache = (this._cache || []).filter(t => t.id !== id);
    this._notify();
    activityService.refresh();
    return true;
  }

  /** Calculate task statistics */
  getTaskStats() {
    const tasks = this.getAllTasks();
    const today = new Date().toISOString().slice(0, 10);

    let total = tasks.length;
    let completed = 0;
    let inProgress = 0;
    let todo = 0;
    let overdue = 0;
    let dueToday = 0;

    for (const t of tasks) {
      if (t.done || t.status === 'completed') {
        completed++;
      } else {
        if (t.status === 'in_progress') inProgress++;
        else todo++;

        if (t.dueDate < today) overdue++;
        else if (t.dueDate === today) dueToday++;
      }
    }

    const pending = todo + inProgress;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      inProgress,
      todo,
      pending,
      overdue,
      dueToday,
      completionRate,
    };
  }

  /** Retrieve today's priority tasks and upcoming uncompleted tasks */
  getTodayAndUpcomingTasks(limit = 6) {
    const tasks = this.getAllTasks();
    const today = new Date().toISOString().slice(0, 10);

    const overdueOrToday = [];
    const upcoming = [];
    const completed = [];

    for (const t of tasks) {
      if (t.done) {
        completed.push(t);
      } else if (t.dueDate <= today) {
        overdueOrToday.push(t);
      } else {
        upcoming.push(t);
      }
    }

    const priorityWeight = { high: 3, medium: 2, low: 1 };
    overdueOrToday.sort((a, b) => {
      if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return priorityWeight[b.priority] - priorityWeight[a.priority];
    });

    upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return [...overdueOrToday, ...upcoming, ...completed].slice(0, limit);
  }

  /** Subscribe to task data changes */
  subscribe(callback) {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  _notify() {
    for (const callback of this._subscribers) {
      try {
        callback();
      } catch (err) {
        console.error('[TaskService] Subscriber error:', err);
      }
    }
  }
}

export const taskService = new TaskService();