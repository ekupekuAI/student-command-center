/**
 * mock.js — Local mock data for Phase 1
 * All data is clearly separated here; replace with API calls in future phases.
 */

export const currentUser = {
  name: 'Alex Johnson',
  initials: 'AJ',
  role: 'Computer Science · Year 3',
  email: 'alex.johnson@university.edu',
  avatar: null, // future: image URL
};

export const subjects = [
  { id: 's1', name: 'Data Structures',   code: 'CS301', accent: 'violet', credits: 4, grade: 'A-', progress: 72 },
  { id: 's2', name: 'Calculus III',      code: 'MATH203', accent: 'blue', credits: 3, grade: 'B+', progress: 58 },
  { id: 's3', name: 'Physics II',        code: 'PHY202', accent: 'cyan', credits: 4, grade: 'B',  progress: 45 },
  { id: 's4', name: 'Algorithms',        code: 'CS401', accent: 'green', credits: 4, grade: 'A',  progress: 88 },
  { id: 's5', name: 'Linear Algebra',    code: 'MATH301', accent: 'yellow', credits: 3, grade: 'B-', progress: 40 },
  { id: 's6', name: 'Technical Writing', code: 'ENG201', accent: 'orange', credits: 2, grade: 'A+', progress: 92 },
];

export const tasks = [
  { id: 't1', title: 'Complete Binary Tree assignment',         subjectId: 's1', due: '2026-08-18', priority: 'high',   done: false },
  { id: 't2', title: 'Practice integration problems (Ch. 7)',   subjectId: 's2', due: '2026-08-19', priority: 'medium', done: false },
  { id: 't3', title: 'Read Chapter 5 — Electromagnetic waves',  subjectId: 's3', due: '2026-08-17', priority: 'high',   done: false },
  { id: 't4', title: 'Implement Dijkstra\'s algorithm',          subjectId: 's4', due: '2026-08-21', priority: 'high',   done: false },
  { id: 't5', title: 'Solve matrix operations worksheet',        subjectId: 's5', due: '2026-08-20', priority: 'medium', done: false },
  { id: 't6', title: 'Draft technical report introduction',      subjectId: 's6', due: '2026-08-22', priority: 'low',    done: true  },
  { id: 't7', title: 'Review sorting algorithms for quiz',       subjectId: 's1', due: '2026-08-17', priority: 'high',   done: true  },
  { id: 't8', title: 'Submit lab report — optics experiment',    subjectId: 's3', due: '2026-08-23', priority: 'medium', done: false },
];

export const studySessions = [
  { id: 'ss1', subjectId: 's4', date: '2026-08-16', duration: 90,  notes: 'Covered DFS and BFS traversal.' },
  { id: 'ss2', subjectId: 's1', date: '2026-08-16', duration: 60,  notes: 'Practiced AVL rotations.' },
  { id: 'ss3', subjectId: 's2', date: '2026-08-15', duration: 120, notes: 'Series convergence tests.' },
  { id: 'ss4', subjectId: 's6', date: '2026-08-15', duration: 45,  notes: 'Outline for technical report.' },
  { id: 'ss5', subjectId: 's3', date: '2026-08-14', duration: 75,  notes: 'Wave mechanics problems.' },
];

export const recentActivity = [
  { id: 'a1', type: 'task_done',   label: 'Completed',    text: 'Review sorting algorithms for quiz',       time: '2 hours ago',   accent: 'green'  },
  { id: 'a2', type: 'session',     label: 'Study session', text: 'Studied Algorithms for 90 minutes',       time: '3 hours ago',   accent: 'violet' },
  { id: 'a3', type: 'note',        label: 'Note saved',    text: 'Added notes on AVL tree rotations',       time: '4 hours ago',   accent: 'blue'   },
  { id: 'a4', type: 'session',     label: 'Study session', text: 'Studied Data Structures for 60 minutes',  time: 'Yesterday',     accent: 'violet' },
  { id: 'a5', type: 'task_done',   label: 'Completed',    text: 'Draft technical report introduction',      time: 'Yesterday',     accent: 'green'  },
];

export const upcomingDeadlines = [
  { id: 'd1', title: 'Read Chapter 5',               subjectId: 's3', date: 'Today',      urgency: 'high'   },
  { id: 'd2', title: 'Review sorting algorithms',    subjectId: 's1', date: 'Today',      urgency: 'high'   },
  { id: 'd3', title: 'Complete Binary Tree assign.', subjectId: 's1', date: 'Aug 18',     urgency: 'medium' },
  { id: 'd4', title: 'Integration problems (Ch.7)',  subjectId: 's2', date: 'Aug 19',     urgency: 'medium' },
  { id: 'd5', title: 'Matrix operations worksheet',  subjectId: 's5', date: 'Aug 20',     urgency: 'low'    },
];

export const weeklyStudyGoal = { target: 20, actual: 14.5 }; // hours

export const stats = {
  tasksCompleted: 12,
  tasksTotal: 20,
  studyHoursWeek: 14.5,
  studyGoal: 20,
  activeSubjects: 6,
  currentStreak: 7,
};

/** Helper: get subject name by ID */
export function getSubjectById(id) {
  return subjects.find(s => s.id === id) || null;
}

/** Helper: get tasks due today or overdue */
export function getTodayTasks() {
  const today = new Date().toISOString().slice(0, 10);
  return tasks.filter(t => !t.done && t.due <= today).slice(0, 5);
}

/** Helper: get pending tasks count */
export function getPendingCount() {
  return tasks.filter(t => !t.done).length;
}
