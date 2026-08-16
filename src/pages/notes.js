/**
 * notes.js — Course & Study Notes Hub
 * Full-featured note-taking interface with search, subject filtering,
 * pinning, sorting, and accessible modal editor.
 */

import { icons } from '../icons.js';
import { noteService } from '../services/noteService.js';
import { subjectService } from '../services/subjectService.js';
import { openNoteModal } from '../components/noteModal.js';
import { showConfirmDialog } from '../components/taskModal.js';
import { showErrorToast } from '../services/notify.js';

export function NotesPage() {
  const container = document.createElement('div');
  container.className = 'page-content';

  const state = {
    search: '',
    subjectId: 'all',
    sortBy: 'pinned_first',
  };

  function renderStatsBar() {
    const stats = noteService.getNotesStats();
    const subjects = subjectService.getAllSubjects();

    return `
      <div class="tasks-stats-bar" style="grid-template-columns: repeat(3, 1fr)">
        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-cyan" style="color:var(--subject-cyan);width:34px;height:34px">
            ${icons.notes(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${stats.total}</div>
            <div class="task-stat-chip-label">Total Notes</div>
          </div>
        </div>

        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-yellow" style="color:var(--subject-yellow);width:34px;height:34px">
            ${icons.star(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${stats.pinnedCount}</div>
            <div class="task-stat-chip-label">Pinned Notes</div>
          </div>
        </div>

        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-violet" style="color:var(--subject-violet);width:34px;height:34px">
            ${icons.subjects(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${subjects.length}</div>
            <div class="task-stat-chip-label">Active Courses</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderFilterToolbar() {
    const subjects = subjectService.getAllSubjects();
    const hasActiveFilters =
      state.search !== '' ||
      state.subjectId !== 'all' ||
      state.sortBy !== 'pinned_first';

    return `
      <div class="filter-toolbar">
        <div class="filter-row-primary">
          <!-- Search input -->
          <div class="filter-search-box">
            ${icons.search(16)}
            <input
              type="search"
              class="filter-search-input"
              id="noteSearchInput"
              placeholder="Search note titles or content..."
              value="${escapeHtml(state.search)}"
              aria-label="Search notes"
            />
          </div>

          <!-- Subject filter -->
          <select class="filter-select" id="filterNoteSubjectSelect" aria-label="Filter notes by subject">
            <option value="all" ${state.subjectId === 'all' ? 'selected' : ''}>All Courses</option>
            <option value="general" ${state.subjectId === 'general' ? 'selected' : ''}>General / No Subject</option>
            ${subjects.map(s => `
              <option value="${s.id}" ${state.subjectId === s.id ? 'selected' : ''}>
                ${s.code} · ${s.name}
              </option>
            `).join('')}
          </select>

          <!-- Sort dropdown -->
          <select class="filter-select" id="sortNoteSelect" aria-label="Sort notes">
            <option value="pinned_first" ${state.sortBy === 'pinned_first' ? 'selected' : ''}>Pinned First</option>
            <option value="newest" ${state.sortBy === 'newest' ? 'selected' : ''}>Newest First</option>
            <option value="oldest" ${state.sortBy === 'oldest' ? 'selected' : ''}>Oldest First</option>
            <option value="title_asc" ${state.sortBy === 'title_asc' ? 'selected' : ''}>Title (A-Z)</option>
          </select>
        </div>

        ${hasActiveFilters ? `
          <div class="filter-row-secondary">
            <div class="active-filter-chips">
              <span>Active filters:</span>
              ${state.search ? `
                <span class="filter-chip">
                  Search: "${state.search}"
                  <span class="filter-chip-remove" data-clear="search">${icons.x(11)}</span>
                </span>
              ` : ''}
              ${state.subjectId !== 'all' ? `
                <span class="filter-chip">
                  Subject: ${state.subjectId === 'general' ? 'General' : (subjectService.getSubjectById(state.subjectId)?.code || state.subjectId)}
                  <span class="filter-chip-remove" data-clear="subject">${icons.x(11)}</span>
                </span>
              ` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" id="clearNoteFiltersBtn" style="color:var(--color-brand-600)">
              Reset filters
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderNotesList() {
    const notes = noteService.getFilteredNotes(state);

    if (notes.length === 0) {
      const hasFilters = state.search || state.subjectId !== 'all';
      return `
        <div class="card empty-state" style="padding: var(--space-12) var(--space-6)">
          <div class="empty-state-icon">${hasFilters ? '🔍' : '📝'}</div>
          <h4>${hasFilters ? 'No matching notes found' : 'No notes written yet'}</h4>
          <p>${hasFilters ? 'Try adjusting your search or active filters.' : 'Create your first course note, summary, or formula sheet.'}</p>
          <div style="margin-top: var(--space-4); display:flex; gap:var(--space-3); justify-content:center">
            ${hasFilters ? `
              <button class="btn btn-secondary btn-sm" id="emptyResetNoteBtn">
                ${icons.x(14)} Clear Filters
              </button>
            ` : ''}
            <button class="btn btn-primary btn-sm" id="emptyAddNoteBtn">
              ${icons.plus(14)} Create New Note
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="notes-grid">
        ${notes.map(note => {
          const subject = subjectService.getSubjectById(note.subjectId);
          const colorKey = subject ? (subject.color || subject.accent || 'violet') : 'blue';
          const updatedDateStr = new Date(note.updatedAt || note.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });

          return `
            <div class="note-card ${note.pinned ? 'is-pinned' : ''}" data-note-id="${note.id}">
              <!-- Header with Subject & Pin -->
              <div class="note-card-header">
                ${subject ? `
                  <span class="badge accent-bg accent-${colorKey}" style="color:var(--subject-${colorKey});font-weight:600">
                    ${subject.code} · ${subject.name}
                  </span>
                ` : `
                  <span class="badge badge-neutral" style="font-size:0.7rem">
                    General Study
                  </span>
                `}

                <button class="note-pin-btn ${note.pinned ? 'pinned' : ''}" data-action="toggle-pin" aria-label="${note.pinned ? 'Unpin note' : 'Pin note'}" title="${note.pinned ? 'Unpin note' : 'Pin note'}">
                  ${icons.star(16)}
                </button>
              </div>

              <!-- Body with Title & Snippet -->
              <div class="note-card-body">
                <div class="note-card-title">${escapeHtml(note.title)}</div>
                <div class="note-card-snippet">${escapeHtml(note.content)}</div>
              </div>

              <!-- Footer with Date & Actions -->
              <div class="note-card-footer">
                <span class="note-card-date">Updated ${updatedDateStr}</span>

                <div class="task-card-actions">
                  <button class="task-action-btn" data-action="edit" aria-label="Edit note" title="Edit note">
                    ${icons.edit(15)}
                  </button>
                  <button class="task-action-btn btn-delete" data-action="delete" aria-label="Delete note" title="Delete note">
                    ${icons.x(15)}
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function render() {
    container.innerHTML = `
      <!-- Page Header -->
      <div class="page-header">
        <div class="page-header-text">
          <h2>Course & Study Notes</h2>
          <p>Organize lecture highlights, key formulas, conceptual summaries, and study sheets</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="createNoteBtn">
            ${icons.plus(16)} New Note
          </button>
        </div>
      </div>

      <!-- Stats Bar -->
      ${renderStatsBar()}

      <!-- Filter Toolbar -->
      ${renderFilterToolbar()}

      <!-- Notes Grid Area -->
      <div id="notesGridWrapper">
        ${renderNotesList()}
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // 1. Create Note Button
    container.querySelector('#createNoteBtn')?.addEventListener('click', () => {
      openNoteModal({
        note: null,
        onSave: (data) => noteService.createNote(data),
      });
    });

    // 2. Search input
    const searchInput = container.querySelector('#noteSearchInput');
    searchInput?.addEventListener('input', (e) => {
      state.search = e.target.value;
      updateGridOnly();
    });

    // 3. Subject filter
    container.querySelector('#filterNoteSubjectSelect')?.addEventListener('change', (e) => {
      state.subjectId = e.target.value;
      render();
    });

    // 4. Sort dropdown
    container.querySelector('#sortNoteSelect')?.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      updateGridOnly();
    });

    // 5. Clear filter chips
    container.querySelectorAll('[data-clear]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.clear;
        if (type === 'search') state.search = '';
        if (type === 'subject') state.subjectId = 'all';
        render();
      });
    });

    // 6. Reset all filters
    container.querySelector('#clearNoteFiltersBtn')?.addEventListener('click', () => {
      state.search = '';
      state.subjectId = 'all';
      state.sortBy = 'pinned_first';
      render();
    });

    container.querySelector('#emptyResetNoteBtn')?.addEventListener('click', () => {
      state.search = '';
      state.subjectId = 'all';
      state.sortBy = 'pinned_first';
      render();
    });

    container.querySelector('#emptyAddNoteBtn')?.addEventListener('click', () => {
      openNoteModal({
        note: null,
        onSave: (data) => noteService.createNote(data),
      });
    });

    // 7. Card Action Delegation (Pin, Edit, Delete)
    const gridWrap = container.querySelector('#notesGridWrapper');
    if (gridWrap) {
      gridWrap.addEventListener('click', (e) => {
        const card = e.target.closest('.note-card');
        if (!card) return;
        const noteId = card.dataset.noteId;

        // Toggle Pin
        if (e.target.closest('[data-action="toggle-pin"]')) {
          noteService.togglePinNote(noteId).catch(showErrorToast);
          return;
        }

        // Edit
        if (e.target.closest('[data-action="edit"]')) {
          const note = noteService.getNoteById(noteId);
          if (note) {
            openNoteModal({
              note,
              onSave: (updates) => noteService.updateNote(noteId, updates),
            });
          }
          return;
        }

        // Delete
        if (e.target.closest('[data-action="delete"]')) {
          const note = noteService.getNoteById(noteId);
          if (note) {
            showConfirmDialog({
              title: 'Delete Note?',
              message: `Are you sure you want to delete "${note.title}"? This cannot be undone.`,
              confirmText: 'Delete Note',
              confirmAccent: 'danger',
              onConfirm: () => noteService.deleteNote(noteId).catch(showErrorToast),
            });
          }
          return;
        }
      });
    }
  }

  function updateGridOnly() {
    const wrapper = container.querySelector('#notesGridWrapper');
    if (wrapper) {
      wrapper.innerHTML = renderNotesList();
    }
  }

  // Initial render
  render();

  // Reactive subscriptions
  const unsubNotes = noteService.subscribe(() => render());
  const unsubSubjects = subjectService.subscribe(() => render());

  container._destroy = () => {
    unsubNotes();
    unsubSubjects();
  };

  return container;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
