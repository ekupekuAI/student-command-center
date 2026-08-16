/**
 * analytics.js — Progress Analytics Dashboard
 * Real-time academic metrics, time range filtering, study activity bar charts,
 * task velocity meters, and subject time allocations with zero fake data.
 */

import { icons } from '../icons.js';
import {
  analyticsService,
  TIME_RANGES,
} from '../services/analyticsService.js';
import { taskService } from '../services/taskService.js';
import { studyService } from '../services/studyService.js';
import { subjectService } from '../services/subjectService.js';
import { noteService } from '../services/noteService.js';

export function AnalyticsPage() {
  const container = document.createElement('div');
  container.className = 'page-content';

  let currentRange = TIME_RANGES.WEEK;

  function renderSummaryCards(data) {
    return `
      <div class="grid-stats" style="margin-bottom: var(--space-8)">
        <div class="stat-card">
          <div class="stat-icon-wrap accent-bg accent-violet" style="color:var(--subject-violet)">
            ${icons.clock(22)}
          </div>
          <div class="stat-body">
            <div class="stat-value">${data.study.totalHours}h</div>
            <div class="stat-label">Study Time (${getRangeLabel(data.range)})</div>
            <div class="stat-delta positive">
              ${data.study.sessionsCount} completed session${data.study.sessionsCount === 1 ? '' : 's'}
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon-wrap accent-bg accent-green" style="color:var(--subject-green)">
            ${icons.check(22)}
          </div>
          <div class="stat-body">
            <div class="stat-value">${data.tasks.completionRate}%</div>
            <div class="stat-label">Task Completion Rate</div>
            <div class="stat-delta ${data.tasks.overdue > 0 ? 'negative' : 'positive'}">
              ${data.tasks.completed}/${data.tasks.total} tasks (${data.tasks.overdue} overdue)
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon-wrap accent-bg accent-blue" style="color:var(--subject-blue)">
            ${icons.target(22)}
          </div>
          <div class="stat-body">
            <div class="stat-value">${data.subjects.avgProgress}%</div>
            <div class="stat-label">Avg Course Coverage</div>
            <div class="stat-delta neutral">
              Across ${data.subjects.activeCount} active courses
            </div>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon-wrap accent-bg accent-orange" style="color:var(--subject-orange)">
            ${icons.flame(22)}
          </div>
          <div class="stat-body">
            <div class="stat-value">${data.study.streakDays}d</div>
            <div class="stat-label">Current Study Streak</div>
            <div class="stat-delta positive">
              ${data.subjects.totalCredits} registered credits
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderWeeklyStudyChart(data) {
    const daily = data.study.weeklyDailyActivity;

    return `
      <div class="card">
        <div class="card-header" style="padding-bottom:var(--space-2)">
          <div>
            <div class="card-title">Study Activity Breakdown</div>
            <div class="card-subtitle">Daily focus distribution for this week</div>
          </div>
          <span class="badge badge-brand">${icons.clock(12)} ${data.study.totalHours} hrs logged</span>
        </div>
        <div class="card-body">
          <div class="study-bar-chart">
            ${daily.map(d => `
              <div class="study-bar-col">
                <span class="study-bar-val">${d.minutes > 0 ? `${d.hours}h` : ''}</span>
                <div class="study-bar-track">
                  <div class="study-bar-fill" style="height: ${Math.max(4, d.heightPercent)}%"></div>
                </div>
                <span class="study-bar-day">${d.day}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderTaskDistribution(data) {
    const t = data.tasks;
    const completedPct = t.total > 0 ? Math.round((t.completed / t.total) * 100) : 0;
    const inProgressPct = t.total > 0 ? Math.round((t.inProgress / t.total) * 100) : 0;
    const todoPct = t.total > 0 ? Math.round((t.todo / t.total) * 100) : 0;

    return `
      <div class="card">
        <div class="card-header" style="padding-bottom:var(--space-2)">
          <div>
            <div class="card-title">Task Completion Velocity</div>
            <div class="card-subtitle">Status & priority distributions</div>
          </div>
          <span class="badge badge-success">${t.completionRate}% Done</span>
        </div>
        <div class="card-body">
          <!-- Stacked distribution bar -->
          <div class="metric-breakdown-row" style="margin-bottom: var(--space-2)">
            <span style="color:var(--text-secondary);font-weight:600">Task Status Ratio</span>
            <span>${t.completed} Completed · ${t.inProgress} In Progress · ${t.todo} To Do</span>
          </div>

          <div class="stacked-progress-bar">
            <div class="stacked-segment" style="width:${completedPct}%;background:var(--color-success)" title="Completed: ${t.completed}"></div>
            <div class="stacked-segment" style="width:${inProgressPct}%;background:var(--color-brand-500)" title="In Progress: ${t.inProgress}"></div>
            <div class="stacked-segment" style="width:${todoPct}%;background:var(--surface-elevated)" title="To Do: ${t.todo}"></div>
          </div>

          <!-- Priority breakdown meter list -->
          <div style="display:flex;flex-direction:column;gap:var(--space-3);margin-top:var(--space-4);padding-top:var(--space-3);border-top:1px solid var(--border-subtle)">
            <div class="metric-breakdown-row">
              <span><span class="badge badge-error" style="font-size:0.68rem;margin-right:6px">High</span> High Priority Tasks</span>
              <span style="font-weight:700">${t.priorityBreakdown.high}</span>
            </div>
            <div class="metric-breakdown-row">
              <span><span class="badge badge-warning" style="font-size:0.68rem;margin-right:6px">Medium</span> Medium Priority Tasks</span>
              <span style="font-weight:700">${t.priorityBreakdown.medium}</span>
            </div>
            <div class="metric-breakdown-row">
              <span><span class="badge badge-neutral" style="font-size:0.68rem;margin-right:6px">Low</span> Low Priority Tasks</span>
              <span style="font-weight:700">${t.priorityBreakdown.low}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderSubjectAllocation(data) {
    const alloc = data.study.subjectAllocation;

    return `
      <div class="card">
        <div class="card-header" style="padding-bottom:var(--space-2)">
          <div>
            <div class="card-title">Study Time by Course</div>
            <div class="card-subtitle">Hours dedicated to each enrolled subject</div>
          </div>
          <span class="badge badge-brand">${alloc.length} Courses</span>
        </div>
        <div class="card-body">
          <div style="display:flex;flex-direction:column;gap:var(--space-4)">
            ${alloc.map(s => `
              <div class="progress-labeled">
                <div class="progress-header">
                  <span class="progress-label">
                    <span class="badge accent-bg accent-${s.color}" style="color:var(--subject-${s.color});margin-right:6px">
                      ${s.code}
                    </span>
                    ${s.name}
                  </span>
                  <span class="progress-value" style="font-weight:700">
                    ${s.hours}h <span style="font-size:var(--text-xs);color:var(--text-tertiary);font-weight:500">(${s.percentage}%)</span>
                  </span>
                </div>
                <div class="progress-track" style="height:8px">
                  <div class="progress-fill" style="width:${Math.max(3, s.percentage)}%;background:var(--subject-${s.color})"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderSubjectTaskMatrix(data) {
    const tasksBySub = data.tasks.tasksBySubject;

    return `
      <div class="card">
        <div class="card-header" style="padding-bottom:var(--space-2)">
          <div>
            <div class="card-title">Course Task Completion</div>
            <div class="card-subtitle">Assignments finished per subject</div>
          </div>
        </div>
        <div class="card-body">
          <div style="display:flex;flex-direction:column;gap:var(--space-4)">
            ${tasksBySub.map(s => `
              <div class="progress-labeled">
                <div class="progress-header">
                  <span class="progress-label">
                    <span class="badge accent-bg accent-${s.color}" style="color:var(--subject-${s.color});margin-right:6px">
                      ${s.code}
                    </span>
                    ${s.name}
                  </span>
                  <span class="progress-value" style="font-weight:700">
                    ${s.completed}/${s.total} done <span style="font-size:var(--text-xs);color:var(--text-tertiary);font-weight:500">(${s.completionRate}%)</span>
                  </span>
                </div>
                <div class="progress-track" style="height:8px">
                  <div class="progress-fill ${s.completionRate >= 80 ? 'success' : s.completionRate >= 50 ? '' : 'warning'}"
                       style="width:${Math.max(3, s.completionRate)}%;background:var(--subject-${s.color})"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function render() {
    const data = analyticsService.getAnalyticsSnapshot(currentRange);

    container.innerHTML = `
      <!-- Page Header -->
      <div class="page-header">
        <div class="page-header-text">
          <h2>Progress & Academic Analytics</h2>
          <p>Real-time metrics on study volume, assignment completion velocity, and course coverage</p>
        </div>

        <!-- Time Range Selector -->
        <div class="analytics-time-pills" role="tablist">
          <button class="analytics-time-btn ${currentRange === TIME_RANGES.TODAY ? 'active' : ''}" data-range="${TIME_RANGES.TODAY}">Today</button>
          <button class="analytics-time-btn ${currentRange === TIME_RANGES.WEEK ? 'active' : ''}" data-range="${TIME_RANGES.WEEK}">This Week</button>
          <button class="analytics-time-btn ${currentRange === TIME_RANGES.MONTH ? 'active' : ''}" data-range="${TIME_RANGES.MONTH}">This Month</button>
          <button class="analytics-time-btn ${currentRange === TIME_RANGES.ALL ? 'active' : ''}" data-range="${TIME_RANGES.ALL}">All Time</button>
        </div>
      </div>

      <!-- Top Metric Cards -->
      ${renderSummaryCards(data)}

      <!-- Row 1: Weekly Study Bar Chart + Task Velocity -->
      <div class="grid-2" style="margin-bottom: var(--space-8)">
        ${renderWeeklyStudyChart(data)}
        ${renderTaskDistribution(data)}
      </div>

      <!-- Row 2: Subject Time Allocation + Course Task Matrix -->
      <div class="grid-2">
        ${renderSubjectAllocation(data)}
        ${renderSubjectTaskMatrix(data)}
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    container.querySelectorAll('.analytics-time-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentRange = btn.dataset.range;
        render();
      });
    });
  }

  function getRangeLabel(range) {
    switch (range) {
      case TIME_RANGES.TODAY: return 'Today';
      case TIME_RANGES.WEEK:  return 'This Week';
      case TIME_RANGES.MONTH: return 'This Month';
      default: return 'All Time';
    }
  }

  // Initial render
  render();

  // Reactive subscriptions across all data providers
  const unsubTasks = taskService.subscribe(() => render());
  const unsubStudy = studyService.subscribe(() => render());
  const unsubSubjects = subjectService.subscribe(() => render());
  const unsubNotes = noteService.subscribe(() => render());

  container._destroy = () => {
    unsubTasks();
    unsubStudy();
    unsubSubjects();
    unsubNotes();
  };

  return container;
}
