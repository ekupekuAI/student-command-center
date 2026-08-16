/**
 * dashboard.js — Live Connected Dashboard Page
 * Reads directly from taskService and activityService as the single source of truth.
 * Supports inline task toggles, quick modal triggers, and live reactive subscriptions.
 */

import { icons } from '../icons.js';
import { currentUser } from '../data/mock.js';
import { taskService } from '../services/taskService.js';
import { subjectService } from '../services/subjectService.js';
import { studyService } from '../services/studyService.js';
import { noteService } from '../services/noteService.js';
import { activityService } from '../services/activityService.js';
import { openTaskModal } from '../components/taskModal.js';
import { openNoteModal } from '../components/noteModal.js';
import { showErrorToast } from '../services/notify.js';

export function DashboardPage() {
  const wrapper = document.createElement('div');
  wrapper.className = 'page-content';

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  function formatDate() {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  function taskDueStatus(due, isDone) {
    if (isDone) return { cls: 'ok', label: `Completed` };
    const today = new Date().toISOString().slice(0, 10);
    if (due < today) return { cls: 'overdue', label: 'Overdue' };
    if (due === today) return { cls: 'soon', label: 'Due today' };
    return { cls: 'ok', label: `Due ${due}` };
  }

  function renderWelcomeBanner() {
    const s = taskService.getTaskStats();
    const studyStats = studyService.getStudyStats();

    return `
      <div class="welcome-banner">
        <div class="welcome-text">
          <div class="welcome-greeting">${getGreeting()} · ${formatDate()}</div>
          <h1 class="welcome-title">Hello, ${currentUser.name.split(' ')[0]}! 👋</h1>
          <p class="welcome-subtitle">
            You have <strong style="color:#fff">${s.pending} pending tasks</strong> (${s.completed} completed)
            and studied <strong style="color:#fff">${studyStats.weekHours}h</strong> this week.
          </p>
          <div class="welcome-cta">
            <button class="btn btn-white" id="dashCreateTaskBtn">
              ${icons.plus(16)} New Task
            </button>
            <button class="btn btn-white-outline" onclick="window.location.hash='#/study'">
              ${icons.clock(16)} Start Study Session
            </button>
          </div>
        </div>
        <div class="welcome-illustration">
          <div class="welcome-stats-chips">
            <div class="stats-chip">
              <div class="stats-chip-icon">${icons.flame(16)}</div>
              <div>
                <div class="stats-chip-value">${studyStats.streakDays}d</div>
                <div class="stats-chip-label">Study Streak 🔥</div>
              </div>
            </div>
            <div class="stats-chip">
              <div class="stats-chip-icon">${icons.target(16)}</div>
              <div>
                <div class="stats-chip-value">${s.completionRate}%</div>
                <div class="stats-chip-label">Task Completion</div>
              </div>
            </div>
            <div class="stats-chip">
              <div class="stats-chip-icon">${icons.trophy(16)}</div>
              <div>
                <div class="stats-chip-value">${s.completed}</div>
                <div class="stats-chip-label">Tasks Done</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderStatCards() {
    const s = taskService.getTaskStats();
    const studyStats = studyService.getStudyStats();
    const studyPct = Math.round((studyStats.weekHours / studyStats.weeklyGoalTarget) * 100);

    const cards = [
      {
        icon: icons.tasks(22),
        iconAccent: 'accent-violet',
        value: `${s.completed}/${s.total}`,
        label: 'Tasks Completed',
        delta: `${s.completionRate}% rate`,
        positive: s.completionRate >= 50,
      },
      {
        icon: icons.clock(22),
        iconAccent: 'accent-blue',
        value: `${studyStats.weekHours}h`,
        label: 'Study Hours (Week)',
        delta: `${studyPct}% of goal`,
        positive: studyPct >= 70,
      },
      {
        icon: icons.subjects(22),
        iconAccent: 'accent-cyan',
        value: subjectService.getAllSubjects().length,
        label: 'Active Subjects',
        delta: 'This semester',
        neutral: true,
      },
      {
        icon: icons.flame(22),
        iconAccent: 'accent-orange',
        value: `${studyStats.streakDays}d`,
        label: 'Study Streak',
        delta: s.overdue > 0 ? `${s.overdue} overdue task${s.overdue > 1 ? 's' : ''}` : 'All on track',
        positive: s.overdue === 0,
      },
    ];

    return `
      <div class="grid-stats">
        ${cards.map(c => `
          <div class="stat-card">
            <div class="stat-icon-wrap accent-bg ${c.iconAccent}">
              <span style="color:var(--accent)">${c.icon}</span>
            </div>
            <div class="stat-body">
              <div class="stat-value">${c.value}</div>
              <div class="stat-label">${c.label}</div>
              <div class="stat-delta ${c.neutral ? 'neutral' : c.positive ? 'positive' : 'negative'}">
                ${c.neutral ? '' : c.positive ? icons.arrowUp(11) : icons.arrowDown(11)}
                ${c.delta}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderTodayTasks() {
    const todayTasks = taskService.getTodayAndUpcomingTasks(6);

    if (!todayTasks.length) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          <h4>All caught up!</h4>
          <p>No pending tasks. Great work!</p>
        </div>
      `;
    }

    return `
      <ul style="list-style:none;padding:0;margin:0" id="dashTaskList">
        ${todayTasks.map(task => {
          const subject = subjectService.getSubjectById(task.subjectId);
          const status = taskDueStatus(task.dueDate, task.done);
          return `
            <li class="task-item ${task.done ? 'task-done-row' : ''}" data-task-id="${task.id}">
              <div class="task-check ${task.done ? 'checked' : ''}" role="checkbox"
                   aria-checked="${task.done}" aria-label="Mark task complete" tabindex="0">
                ${icons.check(10)}
              </div>
              <div class="task-body">
                <div class="task-title" style="${task.done ? 'text-decoration:line-through;color:var(--text-tertiary)' : ''}">
                  ${escapeHtml(task.title)}
                </div>
                <div class="task-meta">
                  ${subject ? `<span class="task-subject">${subject.name}</span>` : ''}
                  <span class="task-due ${status.cls}">${status.label}</span>
                  <span class="badge badge-${task.priority === 'high' ? 'error' : task.priority === 'medium' ? 'warning' : 'neutral'}" style="font-size:0.68rem;padding:1px 6px">
                    ${task.priority}
                  </span>
                  ${task.estimatedMinutes ? `
                    <span style="font-size:var(--text-xs);color:var(--text-tertiary)">⏱ ${task.estimatedMinutes}m</span>
                  ` : ''}
                </div>
              </div>
            </li>
          `;
        }).join('')}
      </ul>
      <div style="padding-top: var(--space-4); border-top: 1px solid var(--border-subtle); margin-top: var(--space-2);">
        <button class="btn btn-ghost btn-sm" onclick="window.location.hash='#/tasks'"
                style="width:100%; justify-content:center; color:var(--text-brand)">
          View all tasks ${icons.chevronRight(14)}
        </button>
      </div>
    `;
  }

  function renderStudyProgress() {
    const topSubjects = subjectService.getAllSubjects().slice(0, 5);
    const studyStats = studyService.getStudyStats();
    const weekPct = Math.min(100, Math.round((studyStats.weekHours / studyStats.weeklyGoalTarget) * 100));

    return `
      <div style="display:flex;flex-direction:column;gap:var(--space-5)">
        <!-- Weekly goal circular indicator -->
        <div style="display:flex;align-items:center;gap:var(--space-5);padding-bottom:var(--space-4);border-bottom:1px solid var(--border-subtle)">
          <div class="circular-progress">
            <svg width="80" height="80" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="32" fill="none" stroke="var(--surface-sunken)" stroke-width="8"/>
              <circle cx="40" cy="40" r="32" fill="none"
                stroke="url(#progressGrad)" stroke-width="8"
                stroke-dasharray="${Math.round(2 * Math.PI * 32)}"
                stroke-dashoffset="${Math.round(2 * Math.PI * 32 * (1 - weekPct / 100))}"
                stroke-linecap="round"
                style="transition: stroke-dashoffset 0.8s ease"/>
              <defs>
                <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="hsl(245,78%,58%)"/>
                  <stop offset="100%" stop-color="hsl(268,70%,60%)"/>
                </linearGradient>
              </defs>
            </svg>
            <div class="circular-progress-label">
              <span class="circular-progress-value">${weekPct}%</span>
              <span class="circular-progress-sub">goal</span>
            </div>
          </div>
          <div>
            <div style="font-family:var(--font-display);font-weight:700;font-size:var(--text-lg);letter-spacing:-0.02em">
              ${studyStats.weekHours}h <span style="color:var(--text-tertiary);font-size:var(--text-sm);font-weight:500">/ ${studyStats.weeklyGoalTarget}h</span>
            </div>
            <div style="color:var(--text-tertiary);font-size:var(--text-sm);margin-top:2px">Weekly study goal</div>
            <div class="session-active-chip" style="margin-top:var(--space-3);cursor:pointer" onclick="window.location.hash='#/study'">
              <span class="session-dot"></span>
              Ready to study
            </div>
          </div>
        </div>

        <!-- Per-subject progress -->
        ${topSubjects.map(s => {
          const colorKey = s.color || s.accent || 'violet';
          return `
            <div class="progress-labeled" style="cursor:pointer" onclick="window.location.hash='#/subjects'">
              <div class="progress-header">
                <span class="progress-label">
                  <span class="badge accent-bg accent-${colorKey}" style="margin-right:4px;color:var(--subject-${colorKey})">${s.code}</span>
                  ${s.name}
                </span>
                <span class="progress-value" style="color:var(--subject-${colorKey})">${s.progress}%</span>
              </div>
              <div class="progress-track">
                <div class="progress-fill ${s.progress >= 80 ? 'success' : s.progress >= 50 ? '' : 'warning'}"
                     style="width: ${s.progress}%; background:var(--subject-${colorKey})"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderUpcomingDeadlines() {
    // Derived from actual uncompleted tasks sorted by due date
    const allTasks = taskService.getAllTasks();
    const uncompletedTasks = allTasks
      .filter(t => !t.done)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .slice(0, 5);

    if (!uncompletedTasks.length) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">📅</div>
          <h4>No pending deadlines</h4>
          <p>You're completely up to date!</p>
        </div>
      `;
    }

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    return `
      <ul style="list-style:none;padding:0;margin:0">
        ${uncompletedTasks.map(task => {
          const subject = subjectService.getSubjectById(task.subjectId);
          let urgency = 'low';
          let dateDisplay = task.dueDate;

          if (task.dueDate <= today) {
            urgency = 'high';
            dateDisplay = task.dueDate === today ? 'Today' : 'Overdue';
          } else if (task.dueDate === tomorrow) {
            urgency = 'medium';
            dateDisplay = 'Tomorrow';
          } else if (task.priority === 'high') {
            urgency = 'medium';
          }

          const URGENCY_ACCENT = { high: 'var(--color-error)', medium: 'var(--color-warning)', low: 'var(--color-success)' };
          const color = URGENCY_ACCENT[urgency] || 'var(--border-default)';

          return `
            <li class="deadline-item" style="cursor:pointer" onclick="window.location.hash='#/tasks'">
              <div class="deadline-color-bar" style="background:${color}"></div>
              <div class="deadline-body">
                <div class="deadline-title">${escapeHtml(task.title)}</div>
                <div class="deadline-subject">${subject ? `${subject.code} · ${subject.name}` : ''}</div>
              </div>
              <div class="deadline-date">
                <span class="badge badge-${urgency === 'high' ? 'error' : urgency === 'medium' ? 'warning' : 'neutral'}">
                  ${dateDisplay}
                </span>
              </div>
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }

  function renderRecentActivity() {
    const activities = activityService.getAllActivities(5);

    const ACTIVITY_STYLE = {
      task_create:   { bg: 'var(--color-brand-100)',  color: 'var(--color-brand-600)' },
      task_done:     { bg: 'var(--color-success-bg)', color: 'var(--color-success)' },
      task_edit:     { bg: 'var(--color-info-bg)',    color: 'var(--color-info)' },
      task_delete:   { bg: 'var(--color-error-bg)',   color: 'var(--color-error)' },
      subject_create: { bg: 'var(--color-brand-100)', color: 'var(--color-brand-600)' },
      subject_update: { bg: 'var(--color-info-bg)',   color: 'var(--color-info)' },
      subject_delete: { bg: 'var(--color-error-bg)',  color: 'var(--color-error)' },
      note_create:   { bg: 'var(--color-info-bg)',    color: 'var(--color-info)' },
      note_update:   { bg: 'var(--color-info-bg)',    color: 'var(--color-info)' },
      note_delete:   { bg: 'var(--color-error-bg)',   color: 'var(--color-error)' },
      session:       { bg: 'var(--color-brand-100)',  color: 'var(--color-brand-600)' },
      note:          { bg: 'var(--color-info-bg)',    color: 'var(--color-info)' },
    };

    const ACTIVITY_ICON = {
      task_create:   icons.plus(16),
      task_done:     icons.check(16),
      task_edit:     icons.edit(16),
      task_delete:   icons.x(16),
      subject_create: icons.plus(16),
      subject_update: icons.edit(16),
      subject_delete: icons.x(16),
      note_create:   icons.plus(16),
      note_update:   icons.edit(16),
      note_delete:   icons.x(16),
      session:       icons.clock(16),
      note:          icons.notes(16),
    };

    if (!activities.length) {
      return `
        <div class="empty-state">
          <div class="empty-state-icon">⚡</div>
          <h4>No recent activity</h4>
          <p>Actions you take will appear here.</p>
        </div>
      `;
    }

    return `
      <ul style="list-style:none;padding:0;margin:0">
        ${activities.map(act => {
          const style = ACTIVITY_STYLE[act.type] || ACTIVITY_STYLE.note;
          const icon  = ACTIVITY_ICON[act.type] || icons.activity(16);
          const relativeTime = activityService.formatRelativeTime(act.timestamp);

          return `
            <li class="activity-item">
              <div class="activity-icon" style="background:${style.bg};color:${style.color}">
                ${icon}
              </div>
              <div class="activity-body">
                <div class="activity-text">
                  <span class="badge badge-neutral" style="margin-right:4px;font-size:0.68rem">${act.label}</span>
                  ${escapeHtml(act.text)}
                </div>
                <div class="activity-time">${relativeTime}</div>
              </div>
            </li>
          `;
        }).join('')}
      </ul>
    `;
  }

  function renderQuickActions() {
    return `
      <div class="grid-quick-actions">
        <button class="quick-action" id="qaNewTask" aria-label="New Task">
          <div class="quick-action-icon accent-bg accent-violet" style="color:var(--subject-violet)">
            ${icons.plus(20)}
          </div>
          <span class="quick-action-label">New Task</span>
        </button>

        <button class="quick-action" onclick="window.location.hash='#/study'" aria-label="Study Now">
          <div class="quick-action-icon accent-bg accent-blue" style="color:var(--subject-blue)">
            ${icons.clock(20)}
          </div>
          <span class="quick-action-label">Study Now</span>
        </button>

        <button class="quick-action" id="qaNewNote" aria-label="New Note">
          <div class="quick-action-icon accent-bg accent-cyan" style="color:var(--subject-cyan)">
            ${icons.notes(20)}
          </div>
          <span class="quick-action-label">New Note</span>
        </button>

        <button class="quick-action" onclick="window.location.hash='#/ai'" aria-label="Ask AI">
          <div class="quick-action-icon accent-bg accent-green" style="color:var(--subject-green)">
            ${icons.brain(20)}
          </div>
          <span class="quick-action-label">Ask AI</span>
        </button>
      </div>
    `;
  }

  function render() {
    const s = taskService.getTaskStats();

    wrapper.innerHTML = `
      <!-- Welcome Banner -->
      ${renderWelcomeBanner()}

      <!-- Stat Cards -->
      ${renderStatCards()}

      <!-- Quick Actions -->
      <div style="margin-bottom: var(--space-8)">
        <div class="section-label">Quick Actions</div>
        ${renderQuickActions()}
      </div>

      <!-- Main grid: Tasks + Progress -->
      <div class="grid-2" style="margin-bottom: var(--space-8)">

        <!-- Today's Tasks -->
        <div class="card">
          <div class="card-header" style="padding-bottom: var(--space-4)">
            <div>
              <div class="card-title">Today & Priority Tasks</div>
              <div class="card-subtitle">Active coursework and assignments</div>
            </div>
            <button class="btn btn-secondary btn-sm" id="cardAddTaskBtn">
              ${icons.plus(14)} Add task
            </button>
          </div>
          <div class="card-body" style="padding-top:0">
            ${renderTodayTasks()}
          </div>
        </div>

        <!-- Study Progress -->
        <div class="card">
          <div class="card-header" style="padding-bottom: var(--space-4)">
            <div>
              <div class="card-title">Study Progress</div>
              <div class="card-subtitle">Weekly goal & subject coverage</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="window.location.hash='#/analytics'"
                    style="color:var(--text-brand)">View all</button>
          </div>
          <div class="card-body" style="padding-top:0">
            ${renderStudyProgress()}
          </div>
        </div>

      </div>

      <!-- Secondary grid: Deadlines + Activity -->
      <div class="grid-2">

        <!-- Upcoming Deadlines -->
        <div class="card">
          <div class="card-header" style="padding-bottom: var(--space-4)">
            <div>
              <div class="card-title">Upcoming Deadlines</div>
              <div class="card-subtitle">Earliest assignment dates</div>
            </div>
            <span class="badge badge-error badge-dot">${s.overdue + s.dueToday} urgent</span>
          </div>
          <div class="card-body" style="padding-top:0">
            ${renderUpcomingDeadlines()}
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="card">
          <div class="card-header" style="padding-bottom: var(--space-4)">
            <div>
              <div class="card-title">Recent Activity</div>
              <div class="card-subtitle">Real-time action stream</div>
            </div>
          </div>
          <div class="card-body" style="padding-top:0">
            ${renderRecentActivity()}
          </div>
        </div>

      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // 1. Create Task Modal handlers
    const openCreate = () => {
      openTaskModal({
        task: null,
        onSave: (data) => taskService.createTask(data),
      });
    };

    wrapper.querySelector('#dashCreateTaskBtn')?.addEventListener('click', openCreate);
    wrapper.querySelector('#cardAddTaskBtn')?.addEventListener('click', openCreate);
    wrapper.querySelector('#qaNewTask')?.addEventListener('click', openCreate);

    wrapper.querySelector('#qaNewNote')?.addEventListener('click', () => {
      openNoteModal({
        note: null,
        onSave: (data) => noteService.createNote(data),
      });
    });

    // 2. Inline task toggle completion
    wrapper.querySelectorAll('.task-check').forEach(chk => {
      chk.addEventListener('click', (e) => {
        e.stopPropagation();
        const li = chk.closest('.task-item');
        if (li && li.dataset.taskId) {
          taskService.toggleTaskCompletion(li.dataset.taskId).catch(showErrorToast);
        }
      });

      chk.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          chk.click();
        }
      });
    });
  }

  // Initial render
  render();

  // Reactive subscription: when tasks, subjects, study sessions, notes, or activities change, re-render dashboard
  const unsubTasks = taskService.subscribe(() => render());
  const unsubSubjects = subjectService.subscribe(() => render());
  const unsubStudy = studyService.subscribe(() => render());
  const unsubNotes = noteService.subscribe(() => render());
  const unsubActivity = activityService.subscribe(() => render());

  wrapper._destroy = () => {
    unsubTasks();
    unsubSubjects();
    unsubStudy();
    unsubNotes();
    unsubActivity();
  };

  return wrapper;
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
