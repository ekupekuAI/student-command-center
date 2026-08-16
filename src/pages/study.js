/**
 * study.js — Study Sessions & Precision Focus Timer Page
 * Drift-free countdown timer, subject tracking, session history logs,
 * customizable timer intervals, and live reactive subscriptions.
 */

import { icons } from '../icons.js';
import { subjectService } from '../services/subjectService.js';
import {
  studyService,
  timerEngine,
  SESSION_TYPES,
  SESSION_TYPE_CONFIG,
} from '../services/studyService.js';
import { showConfirmDialog } from '../components/taskModal.js';
import { showErrorToast } from '../services/notify.js';

export function StudyPage() {
  const container = document.createElement('div');
  container.className = 'page-content';

  const historyState = {
    subjectId: 'all',
    sessionType: 'all',
  };

  const circumference = 2 * Math.PI * 105; // radius = 105 for 260x260 circle

  function renderStatsBar() {
    const stats = studyService.getStudyStats();
    return `
      <div class="tasks-stats-bar" style="grid-template-columns: repeat(4, 1fr)">
        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-violet" style="color:var(--subject-violet);width:34px;height:34px">
            ${icons.clock(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${stats.todayHours}h</div>
            <div class="task-stat-chip-label">Today's Study Time</div>
          </div>
        </div>

        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-blue" style="color:var(--subject-blue);width:34px;height:34px">
            ${icons.target(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${stats.weekHours}h</div>
            <div class="task-stat-chip-label">Weekly Progress (/ ${stats.weeklyGoalTarget}h)</div>
          </div>
        </div>

        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-green" style="color:var(--subject-green);width:34px;height:34px">
            ${icons.check(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${stats.completedSessionsCount}</div>
            <div class="task-stat-chip-label">Focus Sessions Done</div>
          </div>
        </div>

        <div class="task-stat-chip">
          <div class="stat-icon-wrap accent-bg accent-orange" style="color:var(--subject-orange);width:34px;height:34px">
            ${icons.flame(16)}
          </div>
          <div>
            <div class="task-stat-chip-count">${stats.streakDays}d</div>
            <div class="task-stat-chip-label">Study Streak 🔥</div>
          </div>
        </div>
      </div>
    `;
  }

  function renderTimerHero() {
    const subjects = subjectService.getAllSubjects();
    const currentSubject = subjectService.getSubjectById(timerEngine.selectedSubjectId);
    const progressRatio = timerEngine.getProgressRatio();
    const strokeDashoffset = circumference * (1 - progressRatio);
    const modeConfig = SESSION_TYPE_CONFIG[timerEngine.sessionType];

    let statusText = 'Ready to start';
    if (timerEngine.status === 'running') {
      statusText = timerEngine.sessionType === SESSION_TYPES.FOCUS ? 'Focusing...' : 'Break in progress...';
    } else if (timerEngine.status === 'paused') {
      statusText = 'Timer paused';
    } else if (timerEngine.status === 'completed') {
      statusText = 'Session complete! 🎉';
    }

    return `
      <div class="timer-hero-card">
        <!-- Session Type Tabs -->
        <div class="timer-mode-pills" role="tablist">
          <button
            class="timer-mode-btn ${timerEngine.sessionType === SESSION_TYPES.FOCUS ? 'active mode-focus' : ''}"
            data-mode="${SESSION_TYPES.FOCUS}">
            ${icons.zap(14)} Focus (${Math.round(studyService.getTimerSettings().focusMinutes)}m)
          </button>
          <button
            class="timer-mode-btn ${timerEngine.sessionType === SESSION_TYPES.SHORT_BREAK ? 'active mode-short_break' : ''}"
            data-mode="${SESSION_TYPES.SHORT_BREAK}">
            ${icons.clock(14)} Short Break (${Math.round(studyService.getTimerSettings().shortBreakMinutes)}m)
          </button>
          <button
            class="timer-mode-btn ${timerEngine.sessionType === SESSION_TYPES.LONG_BREAK ? 'active mode-long_break' : ''}"
            data-mode="${SESSION_TYPES.LONG_BREAK}">
            ${icons.book(14)} Long Break (${Math.round(studyService.getTimerSettings().longBreakMinutes)}m)
          </button>
        </div>

        <!-- Subject selection (Only for focus mode) -->
        ${timerEngine.sessionType === SESSION_TYPES.FOCUS ? `
          <div class="timer-subject-select-wrap">
            <span style="font-size:var(--text-xs);font-weight:600;color:var(--text-secondary);white-space:nowrap">
              Focus Course:
            </span>
            <select class="form-control form-select" id="timerSubjectSelect" style="height:36px;font-size:var(--text-xs)" ${timerEngine.status === 'running' ? 'disabled' : ''}>
              ${subjects.map(s => `
                <option value="${s.id}" ${s.id === timerEngine.selectedSubjectId ? 'selected' : ''}>
                  ${s.code} · ${s.name}
                </option>
              `).join('')}
            </select>
          </div>
        ` : ''}

        <!-- Big Countdown Gauge -->
        <div class="timer-gauge-wrap">
          <svg class="timer-gauge-svg" viewBox="0 0 240 240">
            <!-- Background circle -->
            <circle class="timer-gauge-bg" cx="120" cy="120" r="105"/>
            <!-- Progress circle -->
            <circle
              class="timer-gauge-progress"
              cx="120"
              cy="120"
              r="105"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${strokeDashoffset}"
              style="stroke: var(--subject-${modeConfig.accent || 'violet'})"
            />
          </svg>

          <!-- Inner text display -->
          <div class="timer-gauge-content">
            <div class="timer-digits" id="timerDigits">${timerEngine.getFormattedTime()}</div>
            <div class="timer-session-label">${statusText}</div>
            ${timerEngine.sessionType === SESSION_TYPES.FOCUS && currentSubject ? `
              <span class="timer-subject-tag accent-bg accent-${currentSubject.color || 'violet'}" style="color:var(--subject-${currentSubject.color || 'violet'})">
                ${currentSubject.code}
              </span>
            ` : ''}
          </div>
        </div>

        <!-- Controls Row -->
        <div class="timer-controls-row">
          ${timerEngine.status === 'running' ? `
            <button class="btn btn-secondary btn-timer-primary" id="timerPauseBtn" aria-label="Pause timer">
              Pause
            </button>
            <button class="btn btn-secondary btn-timer-secondary" id="timerResetBtn" aria-label="Reset timer">
              ${icons.x(14)} Reset
            </button>
            <button class="btn btn-ghost btn-timer-secondary" id="timerSkipBtn" aria-label="Skip session">
              Skip ${icons.chevronRight(14)}
            </button>
          ` : timerEngine.status === 'paused' ? `
            <button class="btn btn-primary btn-timer-primary" id="timerResumeBtn" aria-label="Resume timer">
              ${icons.zap(16)} Resume
            </button>
            <button class="btn btn-secondary btn-timer-secondary" id="timerResetBtn" aria-label="Reset timer">
              ${icons.x(14)} Reset
            </button>
            <button class="btn btn-ghost btn-timer-secondary" id="timerSkipBtn" aria-label="Skip session">
              Skip ${icons.chevronRight(14)}
            </button>
          ` : timerEngine.status === 'completed' ? `
            <button class="btn btn-primary btn-timer-primary" id="timerNextBtn" aria-label="Start next session">
              ${icons.plus(16)} Start Next Session
            </button>
            <button class="btn btn-secondary btn-timer-secondary" id="timerResetBtn" aria-label="Reset timer">
              ${icons.x(14)} Reset
            </button>
          ` : `
            <button class="btn btn-primary btn-timer-primary" id="timerStartBtn" aria-label="Start timer">
              ${icons.zap(16)} Start ${modeConfig.badge}
            </button>
            <button class="btn btn-ghost btn-timer-secondary" id="timerSkipBtn" aria-label="Skip session">
              Skip ${icons.chevronRight(14)}
            </button>
          `}
        </div>

        ${timerEngine.status === 'completed' ? `
          <div class="timer-complete-banner">
            ${icons.check(18)} Session completed and recorded in your study history!
          </div>
        ` : ''}
      </div>
    `;
  }

  function renderTimerSettings() {
    const settings = studyService.getTimerSettings();
    return `
      <div class="timer-settings-panel">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)">
          <div>
            <div class="card-title">Timer Preferences</div>
            <div class="card-subtitle">Configure session durations and behavior</div>
          </div>
          <span class="badge badge-brand">${icons.clock(12)} Custom Durations</span>
        </div>

        <form id="timerSettingsForm" class="timer-settings-grid">
          <div class="form-group">
            <label class="form-label" for="settingFocus">Focus Duration (mins)</label>
            <input type="number" id="settingFocus" name="focusMinutes" class="form-control"
                   min="1" max="180" value="${settings.focusMinutes}" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="settingShort">Short Break (mins)</label>
            <input type="number" id="settingShort" name="shortBreakMinutes" class="form-control"
                   min="1" max="60" value="${settings.shortBreakMinutes}" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="settingLong">Long Break (mins)</label>
            <input type="number" id="settingLong" name="longBreakMinutes" class="form-control"
                   min="1" max="90" value="${settings.longBreakMinutes}" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="settingGoal">Weekly Study Goal (hours)</label>
            <input type="number" id="settingGoal" name="weeklyGoal" class="form-control"
                   min="1" max="168" value="${studyService.getWeeklyGoal()}" required />
          </div>

          <div>
            <button type="submit" class="btn btn-secondary" style="height:42px">
              ${icons.check(14)} Save Defaults
            </button>
          </div>
        </form>
      </div>
    `;
  }

  function renderSessionHistory() {
    const subjects = subjectService.getAllSubjects();
    const sessions = studyService.getFilteredSessions(historyState);

    return `
      <div class="card">
        <div class="card-header" style="padding-bottom:var(--space-4)">
          <div>
            <div class="card-title">Session History</div>
            <div class="card-subtitle">Log of completed focus periods and breaks</div>
          </div>

          <!-- Filters -->
          <div style="display:flex;gap:var(--space-2);flex-wrap:wrap">
            <select class="filter-select" id="historySubjectFilter" aria-label="Filter history by subject" style="height:32px;font-size:0.75rem">
              <option value="all" ${historyState.subjectId === 'all' ? 'selected' : ''}>All Courses</option>
              ${subjects.map(s => `
                <option value="${s.id}" ${historyState.subjectId === s.id ? 'selected' : ''}>${s.code}</option>
              `).join('')}
            </select>

            <select class="filter-select" id="historyTypeFilter" aria-label="Filter history by type" style="height:32px;font-size:0.75rem">
              <option value="all" ${historyState.sessionType === 'all' ? 'selected' : ''}>All Types</option>
              <option value="${SESSION_TYPES.FOCUS}" ${historyState.sessionType === SESSION_TYPES.FOCUS ? 'selected' : ''}>Focus Only</option>
              <option value="${SESSION_TYPES.SHORT_BREAK}" ${historyState.sessionType === SESSION_TYPES.SHORT_BREAK ? 'selected' : ''}>Short Breaks</option>
              <option value="${SESSION_TYPES.LONG_BREAK}" ${historyState.sessionType === SESSION_TYPES.LONG_BREAK ? 'selected' : ''}>Long Breaks</option>
            </select>
          </div>
        </div>

        <div class="card-body" style="padding-top:0">
          ${sessions.length === 0 ? `
            <div class="empty-state">
              <div class="empty-state-icon">⏱</div>
              <h4>No sessions recorded yet</h4>
              <p>Complete a focus or break session using the timer above.</p>
            </div>
          ` : `
            <div>
              ${sessions.map(s => {
                const subject = subjectService.getSubjectById(s.subjectId);
                const config = SESSION_TYPE_CONFIG[s.sessionType] || SESSION_TYPE_CONFIG[SESSION_TYPES.FOCUS];
                const dateDisplay = new Date(s.completedAt || s.startedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return `
                  <div class="session-history-item" data-session-id="${s.id}">
                    <div class="session-history-left">
                      <div class="session-type-icon-box accent-bg accent-${config.accent || 'violet'}" style="color:var(--subject-${config.accent || 'violet'})">
                        ${s.sessionType === SESSION_TYPES.FOCUS ? icons.clock(16) : icons.book(16)}
                      </div>
                      <div class="session-history-info">
                        <div class="session-history-title">
                          ${s.sessionType === SESSION_TYPES.FOCUS
                            ? (subject ? `${subject.code} · ${subject.name}` : 'General Study')
                            : config.label}
                        </div>
                        <div class="session-history-time">${dateDisplay}</div>
                      </div>
                    </div>

                    <div class="session-history-right">
                      <span class="badge badge-brand" style="font-size:0.72rem">
                        ${s.durationMinutes} mins
                      </span>
                      <span class="badge badge-success" style="font-size:0.72rem">
                        ${icons.check(10)} Completed
                      </span>
                      <button class="task-action-btn btn-delete" data-action="delete-session" aria-label="Delete session log" title="Delete log">
                        ${icons.x(14)}
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>
    `;
  }

  function render() {
    container.innerHTML = `
      <!-- Page Header -->
      <div class="page-header">
        <div class="page-header-text">
          <h2>Study Sessions & Focus Timer</h2>
          <p>Boost your productivity with structured interval timers and session tracking</p>
        </div>
      </div>

      <!-- Stats Bar -->
      ${renderStatsBar()}

      <!-- Focus Timer Hero -->
      <div id="timerHeroWrapper">
        ${renderTimerHero()}
      </div>

      <!-- Timer Settings Panel -->
      ${renderTimerSettings()}

      <!-- Historical Session Log -->
      <div id="sessionHistoryWrapper">
        ${renderSessionHistory()}
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    // 1. Session Type Mode Buttons
    container.querySelectorAll('.timer-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        timerEngine.setSessionType(btn.dataset.mode);
        renderTimerOnly();
      });
    });

    // 2. Focus Course Subject Selection
    const subjectSelect = container.querySelector('#timerSubjectSelect');
    subjectSelect?.addEventListener('change', (e) => {
      timerEngine.setSubject(e.target.value);
      renderTimerOnly();
    });

    // 3. Timer Control Buttons
    container.querySelector('#timerStartBtn')?.addEventListener('click', () => {
      timerEngine.start();
      renderTimerOnly();
    });

    container.querySelector('#timerPauseBtn')?.addEventListener('click', () => {
      timerEngine.pause();
      renderTimerOnly();
    });

    container.querySelector('#timerResumeBtn')?.addEventListener('click', () => {
      timerEngine.start();
      renderTimerOnly();
    });

    container.querySelector('#timerResetBtn')?.addEventListener('click', () => {
      timerEngine.reset();
      renderTimerOnly();
    });

    container.querySelector('#timerSkipBtn')?.addEventListener('click', () => {
      timerEngine.skip();
      renderTimerOnly();
    });

    container.querySelector('#timerNextBtn')?.addEventListener('click', () => {
      timerEngine.skip();
      timerEngine.start();
      renderTimerOnly();
    });

    // 4. Timer Settings Form Submit
    const settingsForm = container.querySelector('#timerSettingsForm');
    settingsForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const focusM = parseInt(container.querySelector('#settingFocus').value, 10);
      const shortM = parseInt(container.querySelector('#settingShort').value, 10);
      const longM  = parseInt(container.querySelector('#settingLong').value, 10);
      const goalH  = parseInt(container.querySelector('#settingGoal').value, 10);

      studyService.saveTimerSettings({
        focusMinutes: focusM,
        shortBreakMinutes: shortM,
        longBreakMinutes: longM,
      });

      studyService.setWeeklyGoal(goalH);

      timerEngine.reset();
      render();
    });

    // 5. History Filters
    container.querySelector('#historySubjectFilter')?.addEventListener('change', (e) => {
      historyState.subjectId = e.target.value;
      updateHistoryOnly();
    });

    container.querySelector('#historyTypeFilter')?.addEventListener('change', (e) => {
      historyState.sessionType = e.target.value;
      updateHistoryOnly();
    });

    // 6. Delete History Item (Delegation)
    const histWrap = container.querySelector('#sessionHistoryWrapper');
    histWrap?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="delete-session"]');
      if (!btn) return;
      const item = btn.closest('.session-history-item');
      if (!item) return;

      const sessionId = item.dataset.sessionId;
      showConfirmDialog({
        title: 'Delete Session Record?',
        message: 'Are you sure you want to remove this completed session from your history?',
        confirmText: 'Delete',
        confirmAccent: 'danger',
        onConfirm: () => {
          studyService.deleteSession(sessionId)
            .then(() => updateHistoryOnly())
            .catch(showErrorToast);
        },
      });
    });
  }

  function renderTimerOnly() {
    const heroWrap = container.querySelector('#timerHeroWrapper');
    if (heroWrap) {
      heroWrap.innerHTML = renderTimerHero();
      bindTimerButtons();
    }
  }

  function bindTimerButtons() {
    container.querySelectorAll('.timer-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        timerEngine.setSessionType(btn.dataset.mode);
        renderTimerOnly();
      });
    });

    const subjectSelect = container.querySelector('#timerSubjectSelect');
    subjectSelect?.addEventListener('change', (e) => {
      timerEngine.setSubject(e.target.value);
      renderTimerOnly();
    });

    container.querySelector('#timerStartBtn')?.addEventListener('click', () => {
      timerEngine.start();
      renderTimerOnly();
    });

    container.querySelector('#timerPauseBtn')?.addEventListener('click', () => {
      timerEngine.pause();
      renderTimerOnly();
    });

    container.querySelector('#timerResumeBtn')?.addEventListener('click', () => {
      timerEngine.start();
      renderTimerOnly();
    });

    container.querySelector('#timerResetBtn')?.addEventListener('click', () => {
      timerEngine.reset();
      renderTimerOnly();
    });

    container.querySelector('#timerSkipBtn')?.addEventListener('click', () => {
      timerEngine.skip();
      renderTimerOnly();
    });

    container.querySelector('#timerNextBtn')?.addEventListener('click', () => {
      timerEngine.skip();
      timerEngine.start();
      renderTimerOnly();
    });
  }

  function updateHistoryOnly() {
    const histWrap = container.querySelector('#sessionHistoryWrapper');
    if (histWrap) {
      histWrap.innerHTML = renderSessionHistory();
    }
  }

  // Initial render
  render();

  // Fast timer tick listener: updates gauge and digits smoothly
  const unsubTimer = timerEngine.subscribe(() => {
    // If timer digits element exists, update it directly for maximum performance
    const digits = container.querySelector('#timerDigits');
    if (digits) {
      digits.textContent = timerEngine.getFormattedTime();
      const progressCircle = container.querySelector('.timer-gauge-progress');
      if (progressCircle) {
        const offset = circumference * (1 - timerEngine.getProgressRatio());
        progressCircle.style.strokeDashoffset = offset;
      }
    } else {
      renderTimerOnly();
    }
  });

  // Re-render stats & history when sessions change
  const unsubStudy = studyService.subscribe(() => {
    render();
  });

  const unsubSubjects = subjectService.subscribe(() => {
    renderTimerOnly();
    updateHistoryOnly();
  });

  container._destroy = () => {
    unsubTimer();
    unsubStudy();
    unsubSubjects();
  };

  return container;
}
