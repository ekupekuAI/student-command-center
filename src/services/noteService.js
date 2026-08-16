/**
 * noteService.js — Notes Management Service
 * Handles persistent note records backed by the FastAPI API: subject
 * association, pinning, search filtering, sorting, and statistics.
 * Reads are synchronous from cache; writes are async and server-authoritative.
 */

import { apiClient } from './apiClient.js';
import { storage } from './storage.js';
import { noteToApi, noteToUi } from './mappers.js';
import { activityService } from './activityService.js';

const STORAGE_KEY = 'notes';

class NoteService {
  constructor() {
    this._subscribers = new Set();
    this._cache = null;
    this._source = null;
  }

  /** (Re)load notes from the backend (localStorage fallback when offline). */
  async refresh() {
    try {
      const data = await apiClient.get('/notes');
      this._cache = (Array.isArray(data) ? data : []).map(noteToUi);
      this._source = 'api';
    } catch (err) {
      if (err && err.offline) {
        const local = storage.get(STORAGE_KEY, []);
        this._cache = (Array.isArray(local) ? local : []).map(noteToUi);
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

  /** Get all registered notes */
  getAllNotes() {
    this._ensureLoaded();
    return this._cache || [];
  }

  /** Get a single note by ID */
  getNoteById(id) {
    const notes = this.getAllNotes();
    return notes.find(n => n.id === id) || null;
  }

  /**
   * Filter and sort notes
   * @param {Object} options
   * @param {string} [options.search]
   * @param {string} [options.subjectId] - 'all' | 'general' | subject ID
   * @param {string} [options.sortBy] - 'newest' | 'oldest' | 'title_asc' | 'pinned_first'
   */
  getFilteredNotes(options = {}) {
    const {
      search = '',
      subjectId = 'all',
      sortBy = 'pinned_first',
    } = options;

    let list = this.getAllNotes();

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q)
      );
    }

    if (subjectId !== 'all') {
      if (subjectId === 'general') {
        list = list.filter(n => !n.subjectId);
      } else {
        list = list.filter(n => n.subjectId === subjectId);
      }
    }

    list.sort((a, b) => {
      if (sortBy === 'pinned_first') {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      }
      switch (sortBy) {
        case 'newest':
          return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
        case 'oldest':
          return new Date(a.createdAt) - new Date(b.createdAt);
        case 'title_asc':
          return a.title.localeCompare(b.title);
        default:
          return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
      }
    });

    return list;
  }

  /** Create a new note via the API */
  async createNote(data) {
    const title = (data.title || '').trim();
    const content = (data.content || '').trim();

    if (!title) throw new Error('Note title is required.');
    if (!content) throw new Error('Note content is required.');

    const created = await apiClient.post('/notes', noteToApi({
      title,
      content,
      subjectId: data.subjectId || null,
      pinned: Boolean(data.pinned),
    }));
    const ui = noteToUi(created);
    this._cache = [ui, ...(this._cache || [])];
    this._notify();
    activityService.refresh();
    return ui;
  }

  /** Update an existing note via the API */
  async updateNote(id, updates) {
    const current = this.getNoteById(id);
    if (!current) throw new Error(`Note with id ${id} not found.`);

    const payload = {};
    if (updates.title !== undefined) payload.title = String(updates.title).trim();
    if (updates.content !== undefined) payload.content = String(updates.content).trim();
    if (updates.subjectId !== undefined) payload.subject_id = updates.subjectId || null;
    if (updates.pinned !== undefined) payload.pinned = Boolean(updates.pinned);

    const updated = await apiClient.patch(`/notes/${id}`, payload);
    const ui = noteToUi(updated);
    this._cache = (this._cache || []).map(n => (n.id === id ? ui : n));
    this._notify();
    activityService.refresh();
    return ui;
  }

  /** Toggle pinned status of a note */
  togglePinNote(id) {
    const note = this.getNoteById(id);
    if (!note) return null;
    return this.updateNote(id, { pinned: !note.pinned });
  }

  /** Delete a note via the API */
  async deleteNote(id) {
    const toDelete = this.getNoteById(id);
    if (!toDelete) return false;

    await apiClient.delete(`/notes/${id}`);
    this._cache = (this._cache || []).filter(n => n.id !== id);
    this._notify();
    activityService.refresh();
    return true;
  }

  /** Get notes statistics */
  getNotesStats() {
    const notes = this.getAllNotes();
    const pinnedCount = notes.filter(n => n.pinned).length;
    const subjectCounts = {};

    for (const n of notes) {
      const key = n.subjectId || 'general';
      subjectCounts[key] = (subjectCounts[key] || 0) + 1;
    }

    return {
      total: notes.length,
      pinnedCount,
      subjectCounts,
    };
  }

  subscribe(callback) {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  _notify() {
    for (const callback of this._subscribers) {
      try {
        callback();
      } catch (err) {
        console.error('[NoteService] Subscriber error:', err);
      }
    }
  }
}

export const noteService = new NoteService();