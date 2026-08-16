/**
 * tasks.js — Tasks & Assignments Page
 * Full-featured task hub with reactive filtering, search, sorting,
 * CRUD operations, stats overview, and accessible modal integration.
 */

import { icons } from '../icons.js';
import { subjectService } from '../services/subjectService.js';
import {
  taskService,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
} from '../services/taskService.js';
import { consumePendingSearch } from '../searchBridge.js';
import { openTaskModal, showConfirmDialog } from '../components/taskModal.js';
import { showErrorToast } from '../services/notify.js';

export function TasksPage() {
  const container = document.createElement('div');
  container.className = 'page-content';

  // Component state
  const state = {
    search: consumePendingSearch(),
    status: 'all',
    priority: 'all',
    subjectId: 'all',
    sortBy: 'due_asc',
  };

  // Helper to format due date tag
  function getDueDateTag(dueDate, isDone) {
    if (!dueDate) return { label: 'No date', cls: 'neutral' };
    if (isDone) return { label: `Due ${dueDate}`, cls: 'neutral' };

    const today = new Date().toISOString().slice(0, 10);
    if (dueDate < today) {
      return { label: `Overdue (${dueDate})`, cls: 'error' };
    }
    if (dueDate === today) {
      return { label: 'Due today', cls: 'warning' };
    }

    // Tomorrow check
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    if (dueDate === tomorrow) {
      return { label: 'Due tomorrow', cls: 'brand' };
    }

    return { label: `Due ${dueDate}`, cls: 'neutral' };
  }

  function renderStatsBar() {
    const s = taskService.getTaskStats();
    return `
      <div class="tasks-stats-bar">
        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-violet" style="color:var(--subject-violet);width:34px;height:34px">
            ${icons.tasks(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${s.total}</div>
            <div class="task-stat-chip-label">Total Tasks</div>
          </div>
        </div>

        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-yellow" style="color:var(--subject-yellow);width:34px;height:34px">
            ${icons.clock(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${s.todo}</div>
            <div class="task-stat-chip-label">To Do</div>
          </div>
        </div>

        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-blue" style="color:var(--subject-blue);width:34px;height:34px">
            ${icons.zap(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${s.inProgress}</div>
            <div class="task-stat-chip-label">In Progress</div>
          </div>
        </div>

        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-green" style="color:var(--subject-green);width:34px;height:34px">
            ${icons.check(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${s.completed}</div>
            <div class="task-stat-chip-label">Completed (${s.completionRate}%)</div>
          </div>
        </div>

        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-red" style="color:var(--subject-red);width:34px;height:34px">
            ${icons.target(16)}
          </div>
          <div>
            <div class="task-stat-chip-count" style="color:${s.overdue > 0 ? 'var(--color-error)' : 'inherit'}">${s.overdue}</div>
            <div class="task-stat-chip-label">Overdue</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderFilterToolbar() {
    const hasActiveFilters =
      state.search !== '' ||
      state.status !== 'all' ||
      state.priority !== 'all' ||
      state.subjectId !== 'all' ||
      state.sortBy !== 'due_asc';

    return `
      <div class="filter-toolbar">
        <div class="filter-row-primary">
          <!-- Search input -->
          <div class="filter-search-box">
            ${icons.search(16)}
            <input
              type="search"
              class="filter-search-input"
              id="taskSearchInput"
              placeholder="Search by title or notes..."
              value="${escapeHtml(state.search)}"
              aria-label="Search tasks"
            />
          </div>

          <!-- Status pills -->
          <div class="status-pill-group" role="tablist" aria-label="Filter by status">
            <button class="status-pill-btn ${state.status === 'all' ? 'active' : ''}" data-status="all">All</button>
            <button class="status-pill-btn ${state.status === 'todo' ? 'active' : ''}" data-status="todo">To Do</button>
            <button class="status-pill-btn ${state.status === 'in_progress' ? 'active' : ''}" data-status="in_progress">In Progress</button>
            <button class="status-pill-btn ${state.status === 'completed' ? 'active' : ''}" data-status="completed">Completed</button>
          </div>

          <!-- Priority filter -->
          <select class="filter-select" id="filterPrioritySelect" aria-label="Filter by priority">
            <option value="all" ${state.priority === 'all' ? 'selected' : ''}>All Priorities</option>
            <option value="high" ${state.priority === 'high' ? 'selected' : ''}>High Priority</option>
            <option value="medium" ${state.priority === 'medium' ? 'selected' : ''}>Medium Priority</option>
            <option value="low" ${state.priority === 'low' ? 'selected' : ''}>Low Priority</option>
          </select>

          <!-- Subject filter -->
          <select class="filter-select" id="filterSubjectSelect" aria-label="Filter by subject">
            <option value="all" ${state.subjectId === 'all' ? 'selected' : ''}>All Subjects</option>
            ${subjects.map(s => `
              <option value="${s.id}" ${state.subjectId === s.id ? 'selected' : ''}>
                ${s.code} · ${s.name}
              </option>
            `).join('')}
          </select>

          <!-- Sort dropdown -->
          <select class="filter-select" id="sortSelect" aria-label="Sort tasks">
            <option value="due_asc" ${state.sortBy === 'due_asc' ? 'selected' : ''}>Due Date (Soonest)</option>
            <option value="due_desc" ${state.sortBy === 'due_desc' ? 'selected' : ''}>Due Date (Latest)</option>
            <option value="priority_desc" ${state.sortBy === 'priority_desc' ? 'selected' : ''}>Priority (High-Low)</option>
            <option value="priority_asc" ${state.sortBy === 'priority_asc' ? 'selected' : ''}>Priority (Low-High)</option>
            <option value="created_desc" ${state.sortBy === 'created_desc' ? 'selected' : ''}>Newest First</option>
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
              ${state.status !== 'all' ? `
                <span class="filter-chip">
                  Status: ${state.status.replace('_', ' ')}
                  <span class="filter-chip-remove" data-clear="status">${icons.x(11)}</span>
                </span>
              ` : ''}
              ${state.priority !== 'all' ? `
                <span class="filter-chip">
                  Priority: ${state.priority}
                  <span class="filter-chip-remove" data-clear="priority">${icons.x(11)}</span>
                </span>
              ` : ''}
              ${state.subjectId !== 'all' ? `
                <span class="filter-chip">
                  Subject: ${subjectService.getSubjectById(state.subjectId)?.code || state.subjectId}
                  <span class="filter-chip-remove" data-clear="subject">${icons.x(11)}</span>
                </span>
              ` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" id="clearAllFiltersBtn" style="color:var(--color-brand-600)">
              Reset all filters
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderTaskList() {
    const tasks = taskService.getFilteredTasks(state);

    if (tasks.length === 0) {
      const hasFilters =
        state.search ||
        state.status !== 'all' ||
        state.priority !== 'all' ||
        state.subjectId !== 'all';

      return `
        <div class="card empty-state" style="padding: var(--space-12) var(--space-6)">
          <div class="empty-state-icon">${hasFilters ? '🔍' : '📝'}</div>
          <h4>${hasFilters ? 'No matching tasks found' : 'No tasks yet'}</h4>
          <p>${hasFilters ? 'Try adjusting your search or active filters.' : 'Add your first assignment, project, or homework task.'}</p>
          <div style="margin-top: var(--space-4); display:flex; gap:var(--space-3); justify-content:center">
            ${hasFilters ? `
              <button class="btn btn-secondary btn-sm" id="emptyResetBtn">
                ${icons.x(14)} Clear Filters
              </button>
            ` : ''}
            <button class="btn btn-primary btn-sm" id="emptyCreateBtn">
              ${icons.plus(14)} Create New Task
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="task-grid-container">
        ${tasks.map(task => {
          const subject = subjectService.getSubjectById(task.subjectId);
          const dueTag = getDueDateTag(task.dueDate, task.done);
          const priorityOpt = PRIORITY_OPTIONS.find(p => p.value === task.priority) || PRIORITY_OPTIONS[1];

          return `
            <div class="task-card-item ${task.done ? 'is-done' : ''}" data-task-id="${task.id}">
              <!-- Checkbox circle -->
              <div
                class="task-check-circle ${task.done ? 'checked' : ''}"
                role="checkbox"
                aria-checked="${task.done}"
                aria-label="Mark task complete"
                tabindex="0"
                data-action="toggle"
              >
                ${icons.check(12)}
              </div>

              <!-- Main Content -->
              <div class="task-card-content">
                <div class="task-card-header-row">
                  <div class="task-card-title">${escapeHtml(task.title)}</div>
                </div>

                ${task.description ? `
                  <div class="task-card-desc">${escapeHtml(task.description)}</div>
                ` : ''}

                <!-- Footer tags & actions -->
                <div class="task-card-footer">
                  <div class="task-card-tags">
                    <!-- Subject Badge -->
                    ${subject ? `
                      <span class="badge accent-bg accent-${subject.accent}" style="color:var(--subject-${subject.accent});font-weight:600">
                        ${subject.code} · ${subject.name}
                      </span>
                    ` : ''}

                    <!-- Priority Badge -->
                    <span class="badge badge-${priorityOpt.accent}">
                      ${priorityOpt.label}
                    </span>

                    <!-- Due Date Tag -->
                    <span class="badge badge-${dueTag.cls}">
                      ${dueTag.cls === 'error' ? icons.target(12) : icons.calendar(12)}
                      ${dueTag.label}
                    </span>

                    <!-- Estimated Time Tag -->
                    ${task.estimatedMinutes ? `
                      <span class="badge badge-neutral">
                        ${icons.clock(12)} ${task.estimatedMinutes}m
                      </span>
                    ` : ''}
                  </div>

                  <!-- Actions & Status dropdown -->
                  <div class="task-card-actions">
                    <!-- Status selector pill -->
                    <select class="task-status-select status-${task.status}" data-action="status" aria-label="Change status">
                      ${STATUS_OPTIONS.map(st => `
                        <option value="${st.value}" ${task.status === st.value ? 'selected' : ''}>
                          ${st.label}
                        </option>
                      `).join('')}
                    </select>

                    <!-- Edit Button -->
                    <button class="task-action-btn" data-action="edit" aria-label="Edit task" title="Edit task">
                      ${icons.edit(15)}
                    </button>

                    <!-- Delete Button -->
                    <button class="task-action-btn btn-delete" data-action="delete" aria-label="Delete task" title="Delete task">
                      ${icons.x(15)}
                    </button>
                  </div>
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
          <h2>Tasks & Assignments</h2>
          <p>Track deadlines, coursework, projects, and personal study goals</p>
        </div>
        <div class="page-header-actions">
          <button class="btn btn-primary" id="createTaskBtn">
            ${icons.plus(16)} Create Task
          </button>
        </div>
      </div>

      <!-- Stats Bar -->
      ${renderStatsBar()}

      <!-- Filter Toolbar -->
      ${renderFilterToolbar()}

      <!-- Task List Area -->
      <div id="taskListWrapper">
        ${renderTaskList()}
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // 1. Create Task Button
    container.querySelector('#createTaskBtn')?.addEventListener('click', () => {
      openTaskModal({
        task: null,
        onSave: (newTaskData) => {
          taskService.createTask(newTaskData);
        },
      });
    });

    // 2. Search input
    const searchInput = container.querySelector('#taskSearchInput');
    searchInput?.addEventListener('input', (e) => {
      state.search = e.target.value;
      updateListOnly();
    });

    // 3. Status tab pill buttons
    container.querySelectorAll('.status-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.status = btn.dataset.status;
        render();
      });
    });

    // 4. Priority select
    container.querySelector('#filterPrioritySelect')?.addEventListener('change', (e) => {
      state.priority = e.target.value;
      render();
    });

    // 5. Subject select
    container.querySelector('#filterSubjectSelect')?.addEventListener('change', (e) => {
      state.subjectId = e.target.value;
      render();
    });

    // 6. Sort select
    container.querySelector('#sortSelect')?.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      updateListOnly();
    });

    // 7. Clear filter chips
    container.querySelectorAll('[data-clear]').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.clear;
        if (type === 'search') state.search = '';
        if (type === 'status') state.status = 'all';
        if (type === 'priority') state.priority = 'all';
        if (type === 'subject') state.subjectId = 'all';
        render();
      });
    });

    // 8. Reset all filters
    container.querySelector('#clearAllFiltersBtn')?.addEventListener('click', () => {
      state.search = '';
      state.status = 'all';
      state.priority = 'all';
      state.subjectId = 'all';
      state.sortBy = 'due_asc';
      render();
    });

    container.querySelector('#emptyResetBtn')?.addEventListener('click', () => {
      state.search = '';
      state.status = 'all';
      state.priority = 'all';
      state.subjectId = 'all';
      state.sortBy = 'due_asc';
      render();
    });

    container.querySelector('#emptyCreateBtn')?.addEventListener('click', () => {
      openTaskModal({
        task: null,
        onSave: (data) => taskService.createTask(data),
      });
    });

    // 9. Task item actions (Event delegation)
    const listWrapper = container.querySelector('#taskListWrapper');
    if (listWrapper) {
      listWrapper.addEventListener('click', (e) => {
        const item = e.target.closest('.task-card-item');
        if (!item) return;
        const taskId = item.dataset.taskId;

        // Toggle complete
        if (e.target.closest('[data-action="toggle"]')) {
          taskService.toggleTaskCompletion(taskId).catch(showErrorToast);
          return;
        }

        // Edit
        if (e.target.closest('[data-action="edit"]')) {
          const task = taskService.getTaskById(taskId);
          if (task) {
            openTaskModal({
              task,
              onSave: (updates) => {
                taskService.updateTask(taskId, updates);
              },
            });
          }
          return;
        }

        // Delete
        if (e.target.closest('[data-action="delete"]')) {
          const task = taskService.getTaskById(taskId);
          if (task) {
            showConfirmDialog({
              title: 'Delete Task?',
              message: `Are you sure you want to delete "${task.title}"? This cannot be undone.`,
              confirmText: 'Delete Task',
              confirmAccent: 'danger',
              onConfirm: () => {
                taskService.deleteTask(taskId).catch(showErrorToast);
              },
            });
          }
          return;
        }
      });

      // Status dropdown change
      listWrapper.addEventListener('change', (e) => {
        if (e.target.matches('[data-action="status"]')) {
          const item = e.target.closest('.task-card-item');
          if (item) {
            taskService.setTaskStatus(item.dataset.taskId, e.target.value).catch(showErrorToast);
          }
        }
      });

      // Keyboard accessibility for checkbox circle
      listWrapper.addEventListener('keydown', (e) => {
        if ((e.key === ' ' || e.key === 'Enter') && e.target.matches('.task-check-circle')) {
          e.preventDefault();
          e.target.click();
        }
      });
    }
  }

  function updateListOnly() {
    const wrapper = container.querySelector('#taskListWrapper');
    if (wrapper) {
      wrapper.innerHTML = renderTaskList();
    }
  }

  // Initial render
  render();

  // Reactive subscription: when tasks or subjects update, re-render the view
  const unsubTasks = taskService.subscribe(() => render());
  const unsubSubjects = subjectService.subscribe(() => render());

  // Attach cleanup hook to DOM element
  container._destroy = () => {
    unsubTasks();
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
