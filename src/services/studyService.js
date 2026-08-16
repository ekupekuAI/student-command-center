/**
 * studyService.js — Study Sessions & Precision Focus Timer Service
 * Handles historical study logs (persisted to the backend on completion),
 * stats calculations, timer configurations (kept local), and background
 * drift-free countdown timing across route navigation.
 *
 * The live timer engine remains 100% client-side and timestamp-based; only
 * completed session history is sent to the backend.
 */

import { apiClient } from './apiClient.js';
import { storage } from './storage.js';
import { sessionToApi, sessionToUi } from './mappers.js';
import { subjectService } from './subjectService.js';
import { activityService } from './activityService.js';
import { showErrorToast } from './notify.js';

const SESSIONS_STORAGE_KEY = 'study_sessions';
const SETTINGS_STORAGE_KEY = 'timer_settings';
const GOAL_STORAGE_KEY = 'weekly_study_goal';

// Number of focus sessions completed before a long break is due
const LONG_BREAK_EVERY = 4;

export const SESSION_TYPES = {
  FOCUS: 'focus',
  SHORT_BREAK: 'short_break',
  LONG_BREAK: 'long_break',
};

export const SESSION_TYPE_CONFIG = {
  [SESSION_TYPES.FOCUS]: {
    label: 'Focus Session',
    badge: 'Focus',
    accent: 'violet',
    defaultMinutes: 25,
  },
  [SESSION_TYPES.SHORT_BREAK]: {
    label: 'Short Break',
    badge: 'Short Break',
    accent: 'green',
    defaultMinutes: 5,
  },
  [SESSION_TYPES.LONG_BREAK]: {
    label: 'Long Break',
    badge: 'Long Break',
    accent: 'blue',
    defaultMinutes: 15,
  },
};

const DEFAULT_SETTINGS = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  autoStart: false,
};

/* ─────────────────────────────────────────────────────────────
   STUDY SERVICE — HISTORICAL DATA & STATS
   ───────────────────────────────────────────────────────────── */

class StudyService {
  constructor() {
    this._subscribers = new Set();
    this._cache = null;
    this._source = null;
  }

  /** (Re)load study sessions from the backend. */
  async refreshSessions() {
    try {
      const data = await apiClient.get('/study-sessions');
      this._cache = (Array.isArray(data) ? data : []).map(sessionToUi);
      this._source = 'api';
    } catch (err) {
      if (err && err.offline) {
        const local = storage.get(SESSIONS_STORAGE_KEY, []);
        this._cache = (Array.isArray(local) ? local : []).map(sessionToUi);
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
      this.refreshSessions();
    }
  }

  /** Retrieve all completed study sessions */
  getAllSessions() {
    this._ensureLoaded();
    return this._cache || [];
  }

  /**
   * Filter and sort session history
   * @param {Object} options
   * @param {string} [options.subjectId] - 'all' | subject id
   * @param {string} [options.sessionType] - 'all' | 'focus' | 'short_break' | 'long_break'
   */
  getFilteredSessions(options = {}) {
    const { subjectId = 'all', sessionType = 'all' } = options;
    let list = this.getAllSessions();

    if (subjectId !== 'all') {
      list = list.filter(s => s.subjectId === subjectId);
    }

    if (sessionType !== 'all') {
      list = list.filter(s => s.sessionType === sessionType);
    }

    return list.sort((a, b) => new Date(b.completedAt || b.startedAt) - new Date(a.completedAt || a.startedAt));
  }

  /**
   * Persist a newly finished session to the backend.
   * Timer stays client-side; only the completed record is uploaded.
   */
  async recordCompletedSession(session) {
    const durationMinutes = Math.max(1, Math.round(session.durationMinutes || 25));
    const startedAt = session.startedAt || new Date(Date.now() - durationMinutes * 60000).toISOString();
    const sessionType = session.sessionType || SESSION_TYPES.FOCUS;

    const created = await apiClient.post('/study-sessions', sessionToApi({
      subjectId: session.subjectId || null,
      durationMinutes,
      startedAt,
      completedAt: new Date().toISOString(),
      sessionType,
      completed: true,
      notes: session.notes || '',
    }));

    const ui = sessionToUi(created);
    this._cache = [ui, ...(this._cache || [])];
    this._notify();
    activityService.refresh();
    return ui;
  }

  /** Delete a session from history via the API */
  async deleteSession(id) {
    await apiClient.delete(`/study-sessions/${id}`);
    this._cache = (this._cache || []).filter(s => s.id !== id);
    this._notify();
    activityService.refresh();
    return true;
  }

  /**
   * Retrieve timer settings with fallback defaults (kept local).
   */
  getTimerSettings() {
    return {
      ...DEFAULT_SETTINGS,
      ...(storage.get(SETTINGS_STORAGE_KEY, {})),
    };
  }

  /**
   * Update and persist timer settings (local preference only).
   */
  saveTimerSettings(newSettings) {
    const current = this.getTimerSettings();
    const updated = {
      focusMinutes: Math.max(1, Math.min(180, parseInt(newSettings.focusMinutes, 10) || current.focusMinutes)),
      shortBreakMinutes: Math.max(1, Math.min(60, parseInt(newSettings.shortBreakMinutes, 10) || current.shortBreakMinutes)),
      longBreakMinutes: Math.max(1, Math.min(90, parseInt(newSettings.longBreakMinutes, 10) || current.longBreakMinutes)),
      autoStart: Boolean(newSettings.autoStart),
    };

    storage.set(SETTINGS_STORAGE_KEY, updated);
    this._notify();
    return updated;
  }

  /**
   * Get the user's weekly study goal in hours (persisted local preference).
   * @returns {number}
   */
  getWeeklyGoal() {
    const stored = parseInt(storage.get(GOAL_STORAGE_KEY, 20), 10);
    return Number.isFinite(stored) && stored > 0 ? stored : 20;
  }

  /**
   * Persist the weekly study goal in hours (local preference).
   * @param {number} hours
   * @returns {number} Saved goal
   */
  setWeeklyGoal(hours) {
    const clean = Math.max(1, Math.min(168, parseInt(hours, 10) || 20));
    storage.set(GOAL_STORAGE_KEY, clean);
    this._notify();
    return clean;
  }

  /**
   * Calculate cumulative stats from persisted session history
   */
  getStudyStats() {
    const sessions = this.getAllSessions().filter(s => s.completed && s.sessionType === SESSION_TYPES.FOCUS);
    const todayStr = new Date().toISOString().slice(0, 10);

    // Start of current week (Monday)
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    let totalMinutes = 0;
    let todayMinutes = 0;
    let weekMinutes = 0;
    const sessionDates = new Set();

    for (const s of sessions) {
      const mins = s.durationMinutes || 0;
      totalMinutes += mins;

      const dateStr = (s.completedAt || s.startedAt || '').slice(0, 10);
      if (dateStr) sessionDates.add(dateStr);

      if (dateStr === todayStr) {
        todayMinutes += mins;
      }

      const sessionDate = new Date(s.completedAt || s.startedAt);
      if (sessionDate >= monday) {
        weekMinutes += mins;
      }
    }

    const totalHours = (totalMinutes / 60).toFixed(1);
    const weekHours = parseFloat((weekMinutes / 60).toFixed(1));
    const todayHours = (todayMinutes / 60).toFixed(1);

    // Calculate reliable streak
    let streak = 0;
    const checkDate = new Date();
    while (true) {
      const ymd = checkDate.toISOString().slice(0, 10);
      if (sessionDates.has(ymd)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // If today has no study session yet, check if yesterday had one to maintain streak
        if (streak === 0 && ymd === todayStr) {
          checkDate.setDate(checkDate.getDate() - 1);
          const ymdYesterday = checkDate.toISOString().slice(0, 10);
          if (sessionDates.has(ymdYesterday)) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
          }
        }
        break;
      }
    }

    return {
      totalMinutes,
      totalHours,
      todayMinutes,
      todayHours,
      weekMinutes,
      weekHours,
      completedSessionsCount: sessions.length,
      streakDays: streak,
      weeklyGoalTarget: this.getWeeklyGoal(),
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
        console.error('[StudyService] Subscriber error:', err);
      }
    }
  }
}

export const studyService = new StudyService();

/* ─────────────────────────────────────────────────────────────
   PRECISION DRIFT-FREE TIMER ENGINE (SINGLETON)
   ───────────────────────────────────────────────────────────── */

class TimerEngine {
  constructor() {
    this._subscribers = new Set();
    this.status = 'idle'; // 'idle' | 'running' | 'paused' | 'completed'
    this.sessionType = SESSION_TYPES.FOCUS;
    this.selectedSubjectId = null;

    this.totalDurationSeconds = 25 * 60;
    this.remainingSeconds = 25 * 60;

    this._targetEndTime = null;
    this._intervalId = null;
    this._startedAt = null;

    // Number of focus sessions completed in the current cycle.
    this._cycleCount = 0;

    this._initSubject();
  }

  _initSubject() {
    const subjects = subjectService.getAllSubjects();
    if (subjects.length > 0 && !this.selectedSubjectId) {
      this.selectedSubjectId = subjects[0].id;
    }
  }

  /**
   * Set the active session type (Focus, Short Break, Long Break)
   */
  setSessionType(type) {
    if (this.status === 'running') {
      this.pause();
    }

    this.sessionType = type;
    const settings = studyService.getTimerSettings();

    let minutes = settings.focusMinutes;
    if (type === SESSION_TYPES.SHORT_BREAK) minutes = settings.shortBreakMinutes;
    if (type === SESSION_TYPES.LONG_BREAK)  minutes = settings.longBreakMinutes;

    this.totalDurationSeconds = minutes * 60;
    this.remainingSeconds = this.totalDurationSeconds;
    this.status = 'idle';
    this._targetEndTime = null;
    this._notify();
  }

  /**
   * Set the active subject for focus sessions
   */
  setSubject(subjectId) {
    this.selectedSubjectId = subjectId;
    this._notify();
  }

  /**
   * Start or resume the timer using timestamp calculation to prevent drift
   */
  start() {
    if (this.status === 'running') return;

    this._initSubject();

    if (this.sessionType === SESSION_TYPES.FOCUS && !this.selectedSubjectId) {
      const subjects = subjectService.getAllSubjects();
      if (subjects.length > 0) {
        this.selectedSubjectId = subjects[0].id;
      }
    }

    if (this.status === 'idle' || this.status === 'completed') {
      this._startedAt = new Date().toISOString();
    }

    this.status = 'running';
    this._targetEndTime = Date.now() + (this.remainingSeconds * 1000);

    if (this._intervalId) clearInterval(this._intervalId);

    this._intervalId = setInterval(() => {
      this._tick();
    }, 250);

    this._notify();
  }

  _tick() {
    if (this.status !== 'running' || !this._targetEndTime) return;

    const now = Date.now();
    const diffMs = this._targetEndTime - now;
    const nextRemaining = Math.max(0, Math.ceil(diffMs / 1000));

    if (nextRemaining !== this.remainingSeconds) {
      this.remainingSeconds = nextRemaining;

      if (this.remainingSeconds <= 0) {
        this._handleCompleted();
      } else {
        this._notify();
      }
    }
  }

  pause() {
    if (this.status !== 'running') return;

    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }

    if (this._targetEndTime) {
      this.remainingSeconds = Math.max(0, Math.ceil((this._targetEndTime - Date.now()) / 1000));
    }

    this.status = 'paused';
    this._targetEndTime = null;
    this._notify();
  }

  reset() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }

    const settings = studyService.getTimerSettings();
    let minutes = settings.focusMinutes;
    if (this.sessionType === SESSION_TYPES.SHORT_BREAK) minutes = settings.shortBreakMinutes;
    if (this.sessionType === SESSION_TYPES.LONG_BREAK)  minutes = settings.longBreakMinutes;

    this.totalDurationSeconds = minutes * 60;
    this.remainingSeconds = this.totalDurationSeconds;
    this.status = 'idle';
    this._targetEndTime = null;
    this._startedAt = null;
    this._notify();
  }

  /**
   * Determine the next session type for the Pomodoro cycle:
   *   Focus → Short Break (or Long Break once LONG_BREAK_EVERY focus
   *   sessions have been completed), any Break → Focus.
   */
  _nextSessionType() {
    if (this.sessionType === SESSION_TYPES.FOCUS) {
      return this._cycleCount >= LONG_BREAK_EVERY
        ? SESSION_TYPES.LONG_BREAK
        : SESSION_TYPES.SHORT_BREAK;
    }
    return SESSION_TYPES.FOCUS;
  }

  /**
   * Skip the current session and advance to the next one in the cycle.
   */
  skip() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }

    if (this.sessionType === SESSION_TYPES.LONG_BREAK) {
      this._cycleCount = 0;
    }

    this.setSessionType(this._nextSessionType());
  }

  _handleCompleted() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }

    this.status = 'completed';
    this.remainingSeconds = 0;

    if (this.sessionType === SESSION_TYPES.FOCUS) {
      this._cycleCount++;
    } else if (this.sessionType === SESSION_TYPES.LONG_BREAK) {
      this._cycleCount = 0;
    }

    const durationMins = Math.max(1, Math.round(this.totalDurationSeconds / 60));

    // Persist completed session (fire-and-forget; timer never blocks on the
    // network). Failures surface as a toast so a lost save is never silent.
    studyService.recordCompletedSession({
      subjectId: this.sessionType === SESSION_TYPES.FOCUS ? this.selectedSubjectId : null,
      durationMinutes: durationMins,
      startedAt: this._startedAt || new Date(Date.now() - this.totalDurationSeconds * 1000).toISOString(),
      sessionType: this.sessionType,
    }).catch((err) => {
      console.error('[TimerEngine] Failed to persist session:', err);
      showErrorToast(err);
    });

    const settings = studyService.getTimerSettings();
    if (settings.autoStart) {
      setTimeout(() => {
        this.skip();
        this.start();
      }, 1000);
    } else {
      this._notify();
    }
  }

  /**
   * Formats remaining time into MM:SS
   */
  getFormattedTime() {
    const mins = Math.floor(this.remainingSeconds / 60);
    const secs = this.remainingSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Returns current progress ratio between 0.0 and 1.0
   */
  getProgressRatio() {
    if (this.totalDurationSeconds === 0) return 1;
    return Math.min(1, Math.max(0, (this.totalDurationSeconds - this.remainingSeconds) / this.totalDurationSeconds));
  }

  subscribe(callback) {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  _notify() {
    for (const callback of this._subscribers) {
      try {
        callback(this);
      } catch (err) {
        console.error('[TimerEngine] Subscriber error:', err);
      }
    }
  }
}

export const timerEngine = new TimerEngine();