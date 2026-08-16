/**
 * analyticsService.js — Real-Time Academic & Progress Analytics
 * Computes live, derived statistics across tasks, subjects, study sessions,
 * and notes without introducing fake data.
 */

import { taskService } from './taskService.js';
import { subjectService } from './subjectService.js';
import { studyService, SESSION_TYPES } from './studyService.js';
import { noteService } from './noteService.js';

export const TIME_RANGES = {
  TODAY: 'today',
  WEEK:  'week',
  MONTH: 'month',
  ALL:   'all',
};

class AnalyticsService {
  /**
   * Determine whether a date falls within the selected time range
   * @param {string|Date} dateVal
   * @param {string} range - 'today' | 'week' | 'month' | 'all'
   */
  isDateInRange(dateVal, range = TIME_RANGES.WEEK) {
    if (!dateVal || range === TIME_RANGES.ALL) return true;

    const d = new Date(dateVal);
    const now = new Date();

    if (range === TIME_RANGES.TODAY) {
      return d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
    }

    if (range === TIME_RANGES.WEEK) {
      // Start of week (Monday)
      const day = now.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      monday.setHours(0, 0, 0, 0);
      return d >= monday;
    }

    if (range === TIME_RANGES.MONTH) {
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      return d >= firstOfMonth;
    }

    return true;
  }

  /**
   * Compute comprehensive analytics snapshot for a given time range
   * @param {string} range - 'today' | 'week' | 'month' | 'all'
   */
  getAnalyticsSnapshot(range = TIME_RANGES.WEEK) {
    const allSubjects = subjectService.getAllSubjects();
    const allTasks = taskService.getAllTasks();
    const allSessions = studyService.getAllSessions();
    const allNotes = noteService.getAllNotes();

    // ── 1. Filtered Study Sessions ──────────────────────────────
    const filteredSessions = allSessions.filter(s =>
      s.completed &&
      s.sessionType === SESSION_TYPES.FOCUS &&
      this.isDateInRange(s.completedAt || s.startedAt, range)
    );

    const totalStudyMinutes = filteredSessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
    const totalStudyHours = (totalStudyMinutes / 60).toFixed(1);

    // ── 2. Study Time By Subject ────────────────────────────────
    const studyMinutesBySubject = {};
    allSubjects.forEach(s => { studyMinutesBySubject[s.id] = 0; });

    filteredSessions.forEach(s => {
      if (s.subjectId && studyMinutesBySubject[s.subjectId] !== undefined) {
        studyMinutesBySubject[s.subjectId] += (s.durationMinutes || 0);
      }
    });

    const subjectStudyAllocation = allSubjects.map(s => {
      const minutes = studyMinutesBySubject[s.id] || 0;
      const hours = (minutes / 60).toFixed(1);
      const pct = totalStudyMinutes > 0 ? Math.round((minutes / totalStudyMinutes) * 100) : 0;
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        color: s.color || s.accent || 'violet',
        minutes,
        hours,
        percentage: pct,
      };
    });

    // ── 3. Weekly Day-by-Day Study Distribution ─────────────────
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dailyStudyMinutes = [0, 0, 0, 0, 0, 0, 0];

    // Calculate start of current week
    const now = new Date();
    const currentDay = now.getDay();
    const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    allSessions.forEach(s => {
      if (s.completed && s.sessionType === SESSION_TYPES.FOCUS) {
        const sessionDate = new Date(s.completedAt || s.startedAt);
        if (sessionDate >= monday) {
          let dayIndex = sessionDate.getDay() - 1;
          if (dayIndex < 0) dayIndex = 6; // Sunday
          dailyStudyMinutes[dayIndex] += (s.durationMinutes || 0);
        }
      }
    });

    const maxDailyMinutes = Math.max(...dailyStudyMinutes, 60);
    const weeklyDailyActivity = dayNames.map((name, i) => ({
      day: name,
      minutes: dailyStudyMinutes[i],
      hours: (dailyStudyMinutes[i] / 60).toFixed(1),
      heightPercent: Math.round((dailyStudyMinutes[i] / maxDailyMinutes) * 100),
    }));

    // ── 4. Task Metrics in Range ────────────────────────────────
    const tasksInRange = allTasks.filter(t => this.isDateInRange(t.dueDate || t.createdDate, range));
    const totalTasks = tasksInRange.length;
    const completedTasks = tasksInRange.filter(t => t.done || t.status === 'completed').length;
    const inProgressTasks = tasksInRange.filter(t => !t.done && t.status === 'in_progress').length;
    const todoTasks = tasksInRange.filter(t => !t.done && t.status === 'todo').length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const overdueTasks = tasksInRange.filter(t => !t.done && t.dueDate < todayStr).length;
    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Priority breakdown
    const priorityBreakdown = {
      high: tasksInRange.filter(t => t.priority === 'high').length,
      medium: tasksInRange.filter(t => t.priority === 'medium').length,
      low: tasksInRange.filter(t => t.priority === 'low').length,
    };

    // Task counts by subject (respecting the selected time range)
    const tasksBySubject = allSubjects.map(s => {
      const subTasks = allTasks.filter(t =>
        t.subjectId === s.id && this.isDateInRange(t.dueDate || t.createdDate, range)
      );
      const doneSubTasks = subTasks.filter(t => t.done).length;
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        color: s.color || s.accent || 'violet',
        total: subTasks.length,
        completed: doneSubTasks,
        completionRate: subTasks.length > 0 ? Math.round((doneSubTasks / subTasks.length) * 100) : 0,
      };
    });

    // ── 5. Subject & Academic Summary ───────────────────────────
    const totalCredits = allSubjects.reduce((sum, s) => sum + (s.credits || 0), 0);
    const avgSubjectProgress = allSubjects.length > 0
      ? Math.round(allSubjects.reduce((sum, s) => sum + (s.progress || 0), 0) / allSubjects.length)
      : 0;

    // ── 6. Notes Metrics ────────────────────────────────────────
    const notesInRange = allNotes.filter(n => this.isDateInRange(n.createdAt, range));
    const totalNotes = notesInRange.length;
    const pinnedNotes = allNotes.filter(n => n.pinned).length;

    return {
      range,
      study: {
        totalMinutes: totalStudyMinutes,
        totalHours: totalStudyHours,
        sessionsCount: filteredSessions.length,
        streakDays: studyService.getStudyStats().streakDays,
        subjectAllocation: subjectStudyAllocation,
        weeklyDailyActivity,
      },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        inProgress: inProgressTasks,
        todo: todoTasks,
        overdue: overdueTasks,
        completionRate: taskCompletionRate,
        priorityBreakdown,
        tasksBySubject,
      },
      subjects: {
        activeCount: allSubjects.length,
        totalCredits,
        avgProgress: avgSubjectProgress,
        list: allSubjects,
      },
      notes: {
        total: totalNotes,
        pinned: pinnedNotes,
      },
    };
  }
}

export const analyticsService = new AnalyticsService();
