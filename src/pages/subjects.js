/**
 * subjects.js — Subjects & Course Management Page
 * Full-featured subject hub with reactive filtering, course cards,
 * progress management, credit tracking, and modal CRUD operations.
 */

import { icons } from '../icons.js';
import { subjectService } from '../services/subjectService.js';
import { taskService } from '../services/taskService.js';
import { openSubjectModal } from '../components/subjectModal.js';
import { showConfirmDialog } from '../components/taskModal.js';
import { showErrorToast } from '../services/notify.js';

export function SubjectsPage() {
  const container = document.createElement('div');
  container.className = 'page-content';

  // Component filter state
  const state = {
    search: '',
    semester: 'all',
    sortBy: 'code_asc',
  };

  function renderStatsBar() {
    const s = subjectService.getSubjectStats();
    return `
      <div class="tasks-stats-bar" style="grid-template-columns: repeat(4, 1fr)">
        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-violet" style="color:var(--subject-violet);width:34px;height:34px">
            ${icons.subjects(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${s.total}</div>
            <div class="task-stat-chip-label">Enrolled Courses</div>
          </div>
        </div>

        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-blue" style="color:var(--subject-blue);width:34px;height:34px">
            ${icons.book(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${s.totalCredits}</div>
            <div class="task-stat-chip-label">Total Credits</div>
          </div>
        </div>

        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-green" style="color:var(--subject-green);width:34px;height:34px">
            ${icons.target(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${s.avgProgress}%</div>
            <div class="task-stat-chip-label">Avg Course Progress</div>
          </div>
        </div>

        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-yellow" style="color:var(--subject-yellow);width:34px;height:34px">
            ${icons.calendar(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${s.semesters}</div>
            <div class="task-stat-chip-label">Active Semester(s)</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderFilterToolbar() {
    const semesters = subjectService.getSemesters();
    const hasActiveFilters =
      state.search !== '' ||
      state.semester !== 'all' ||
      state.sortBy !== 'code_asc';

    return `
      <div class="filter-toolbar">
        <div class="filter-row-primary">
          <!-- Search input -->
          <div class="filter-search-box">
            ${icons.search(16)}
            <input
              type="search"
              class="filter-search-input"
              id="subjectSearchInput"
              placeholder="Search by course code, title, or instructor..."
              value="${escapeHtml(state.search)}"
              aria-label="Search subjects"
            />
          </div>

          <!-- Semester dropdown -->
          <select class="filter-select" id="filterSemesterSelect" aria-label="Filter by semester">
            <option value="all" ${state.semester === 'all' ? 'selected' : ''}>All Semesters</option>
            ${semesters.map(sem => `
              <option value="${sem}" ${state.semester === sem ? 'selected' : ''}>
                ${sem}
              </option>
            `).join('')}
          </select>

          <!-- Sort dropdown -->
          <select class="filter-select" id="sortSubjectSelect" aria-label="Sort subjects">
            <option value="code_asc" ${state.sortBy === 'code_asc' ? 'selected' : ''}>Course Code (A-Z)</option>
            <option value="name_asc" ${state.sortBy === 'name_asc' ? 'selected' : ''}>Course Title (A-Z)</option>
            <option value="progress_desc" ${state.sortBy === 'progress_desc' ? 'selected' : ''}>Progress (High to Low)</option>
            <option value="progress_asc" ${state.sortBy === 'progress_asc' ? 'selected' : ''}>Progress (Low to High)</option>
            <option value="credits_desc" ${state.sortBy === 'credits_desc' ? 'selected' : ''}>Credits (High to Low)</option>
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
              ${state.semester !== 'all' ? `
                <span class="filter-chip">
                  Semester: ${state.semester}
                  <span class="filter-chip-remove" data-clear="semester">${icons.x(11)}</span>
                </span>
              ` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" id="clearSubjectFiltersBtn" style="color:var(--color-brand-600)">
              Reset filters
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderSubjectCards() {
    const subjectsList = subjectService.getFilteredSubjects(state);
    const allTasks = taskService.getAllTasks();

    if (subjectsList.length === 0) {
      const hasFilters = state.search || state.semester !== 'all';
      return `
        <div class="card empty-state" style="padding: var(--space-12) var(--space-6)">
          <div class="empty-state-icon">${hasFilters ? '🔍' : '📚'}</div>
          <h4>${hasFilters ? 'No matching courses found' : 'No subjects enrolled yet'}</h4>
          <p>${hasFilters ? 'Try adjusting your search or semester filter.' : 'Add your first semester course to track assignments and progress.'}</p>
          <div style="margin-top: var(--space-4); display:flex; gap:var(--space-3); justify-content:center">
            ${hasFilters ? `
              <button class="btn btn-secondary btn-sm" id="emptyResetSubjectBtn">
                ${icons.x(14)} Clear Filters
              </button>
            ` : ''}
            <button class="btn btn-primary btn-sm" id="emptyAddSubjectBtn">
              ${icons.plus(14)} Add New Subject
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="subjects-grid">
        ${subjectsList.map(subj => {
          const colorKey = subj.color || subj.accent || 'violet';
          const tasksForSubject = allTasks.filter(t => t.subjectId === subj.id);
          const pendingTasksCount = tasksForSubject.filter(t => !t.done).length;

          return `
            <div class="subject-card" data-subject-id="${subj.id}">
              <!-- Top colored stripe -->
              <div class="subject-card-top-stripe accent-bg accent-${colorKey}" style="background:var(--subject-${colorKey})"></div>

              <!-- Header with Code and Grade -->
              <div class="subject-card-header">
                <span class="subject-code-pill accent-bg accent-${colorKey}" style="color:var(--subject-${colorKey})">
                  ${subj.code}
                </span>
                ${subj.grade ? `
                  <span class="badge badge-brand" style="font-size:0.72rem">
                    ${subj.grade}
                  </span>
                ` : ''}
              </div>

              <!-- Body with Title, Instructor, Meta -->
              <div class="subject-card-body">
                <div class="subject-card-title">${escapeHtml(subj.name)}</div>
                <div class="subject-card-instructor">
                  ${icons.user(13)}
                  <span>${escapeHtml(subj.instructor || 'Instructor TBA')}</span>
                </div>

                <div class="subject-card-meta-chips">
                  <span class="badge badge-neutral" style="font-size:0.7rem">
                    ${icons.book(12)} ${subj.credits} Credits
                  </span>
                  <span class="badge badge-neutral" style="font-size:0.7rem">
                    ${icons.calendar(12)} ${subj.semester}
                  </span>
                </div>

                <!-- Progress Section with Quick Increment/Decrement Buttons -->
                <div class="subject-progress-section">
                  <div class="subject-progress-header">
                    <span class="subject-progress-title">Course Coverage</span>
                    <span class="subject-progress-val accent-color accent-${colorKey}" style="color:var(--subject-${colorKey})">
                      ${subj.progress}%
                    </span>
                  </div>

                  <div class="progress-track" style="height:7px">
                    <div class="progress-fill ${subj.progress >= 80 ? 'success' : subj.progress >= 50 ? '' : 'warning'}"
                         style="width: ${subj.progress}%; background:var(--subject-${colorKey})"></div>
                  </div>

                  <div class="subject-quick-progress">
                    <button class="quick-prog-btn" data-action="adjust-progress" data-amount="-10" title="Decrease progress by 10%">-10%</button>
                    <button class="quick-prog-btn" data-action="adjust-progress" data-amount="-5" title="Decrease progress by 5%">-5%</button>
                    <button class="quick-prog-btn" data-action="adjust-progress" data-amount="+5" title="Increase progress by 5%">+5%</button>
                    <button class="quick-prog-btn" data-action="adjust-progress" data-amount="+10" title="Increase progress by 10%">+10%</button>
                  </div>
                </div>
              </div>

              <!-- Footer with linked tasks counter & Edit/Delete actions -->
              <div class="subject-card-footer">
                <div class="subject-tasks-counter">
                  ${icons.tasks(13)}
                  <span>${pendingTasksCount} pending / ${tasksForSubject.length} task${tasksForSubject.length === 1 ? '' : 's'}</span>
                </div>

                <div class="subject-card-actions">
                  <button class="task-action-btn" data-action="edit" aria-label="Edit subject" title="Edit course">
                    ${icons.edit(15)}
                  </button>
                  <button class="task-action-btn btn-delete" data-action="delete" aria-label="Delete subject" title="Delete course">
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
          <h2>Subjects & Course Hub</h2>
          <p>Manage enrolled courses, instructors, credit hours, and syllabus coverage</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="addSubjectBtn">
            ${icons.plus(16)} Add Subject
          </button>
        </div>
      </div>

      <!-- Stats Bar -->
      ${renderStatsBar()}

      <!-- Filter Toolbar -->
      ${renderFilterToolbar()}

      <!-- Subject Cards Grid Area -->
      <div id="subjectGridWrapper">
        ${renderSubjectCards()}
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // 1. Add Subject Button
    container.querySelector('#addSubjectBtn')?.addEventListener('click', () => {
      openSubjectModal({
        subject: null,
        onSave: (data) => subjectService.createSubject(data),
      });
    });

    // 2. Search input
    const searchInput = container.querySelector('#subjectSearchInput');
    searchInput?.addEventListener('input', (e) => {
      state.search = e.target.value;
      updateGridOnly();
    });

    // 3. Semester dropdown
    container.querySelector('#filterSemesterSelect')?.addEventListener('change', (e) => {
      state.semester = e.target.value;
      render();
    });

    // 4. Sort dropdown
    container.querySelector('#sortSubjectSelect')?.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      updateGridOnly();
    });

    // 5. Clear filter chips
    container.querySelectorAll('[data-clear]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.clear;
        if (type === 'search') state.search = '';
        if (type === 'semester') state.semester = 'all';
        render();
      });
    });

    // 6. Reset all filters
    container.querySelector('#clearSubjectFiltersBtn')?.addEventListener('click', () => {
      state.search = '';
      state.semester = 'all';
      state.sortBy = 'code_asc';
      render();
    });

    container.querySelector('#emptyResetSubjectBtn')?.addEventListener('click', () => {
      state.search = '';
      state.semester = 'all';
      state.sortBy = 'code_asc';
      render();
    });

    container.querySelector('#emptyAddSubjectBtn')?.addEventListener('click', () => {
      openSubjectModal({
        subject: null,
        onSave: (data) => subjectService.createSubject(data),
      });
    });

    // 7. Subject card actions (Event delegation)
    const gridWrapper = container.querySelector('#subjectGridWrapper');
    if (gridWrapper) {
      gridWrapper.addEventListener('click', (e) => {
        const card = e.target.closest('.subject-card');
        if (!card) return;
        const subjectId = card.dataset.subjectId;

        // Quick progress adjust (+5%, +10%, -5%, -10%)
        const progBtn = e.target.closest('[data-action="adjust-progress"]');
        if (progBtn) {
          const delta = parseInt(progBtn.dataset.amount, 10);
          const current = subjectService.getSubjectById(subjectId);
          if (current) {
            const newProg = Math.min(100, Math.max(0, (current.progress || 0) + delta));
            subjectService.updateSubjectProgress(subjectId, newProg).catch(showErrorToast);
          }
          return;
        }

        // Edit
        if (e.target.closest('[data-action="edit"]')) {
          const subject = subjectService.getSubjectById(subjectId);
          if (subject) {
            openSubjectModal({
              subject,
              onSave: (updates) => {
                subjectService.updateSubject(subjectId, updates);
              },
            });
          }
          return;
        }

        // Delete
        if (e.target.closest('[data-action="delete"]')) {
          const subject = subjectService.getSubjectById(subjectId);
          if (subject) {
            const attachedTasks = taskService.getAllTasks().filter(t => t.subjectId === subjectId);
            const hasLinked = attachedTasks.length > 0;
            const warningExtra = hasLinked
              ? ` ${attachedTasks.length} linked task(s) will be kept but unassigned from this course.`
              : '';

            showConfirmDialog({
              title: `Delete ${subject.code}?`,
              message: `Are you sure you want to remove "${subject.name}"?${warningExtra}`,
              confirmText: 'Delete Course',
              confirmAccent: 'danger',
              onConfirm: () => {
                subjectService.deleteSubject(subjectId).catch(showErrorToast);
              },
            });
          }
          return;
        }
      });
    }
  }

  function updateGridOnly() {
    const wrapper = container.querySelector('#subjectGridWrapper');
    if (wrapper) {
      wrapper.innerHTML = renderSubjectCards();
    }
  }

  // Initial render
  render();

  // Reactive subscription: when subjects or tasks change, re-render
  const unsubSubjects = subjectService.subscribe(() => render());
  const unsubTasks = taskService.subscribe(() => render());

  container._destroy = () => {
    unsubSubjects();
    unsubTasks();
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
