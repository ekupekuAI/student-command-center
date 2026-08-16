"""Intent-aware, bounded student context builder for the AI assistant.

The assistant must NEVER receive the whole database. `build_student_context`
first classifies the user's message into an intent, then assembles only the
relevant, size-limited slices of student data needed to answer well.

Everything returned here is already public-facing app data (task titles, due
dates, subject progress, note summaries). No credentials, keys, or internal
fields are ever included.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.note import Note
from app.models.study_session import StudySession
from app.models.subject import Subject
from app.models.task import Task


class Intent:
    TASKS_DUE = "tasks_due"
    PRIORITIZE = "prioritize"
    STUDY_PLAN = "study_plan"
    SUBJECT_FOCUS = "subject_focus"
    NOTES = "notes"
    STUDY_STATS = "study_stats"
    GENERAL = "general"


# Ordered intent rules — first match wins, so specific phrasings take priority.
INTENT_RULES: list[tuple[str, tuple[str, ...]]] = [
    (
        Intent.STUDY_PLAN,
        (
            "study plan", "study schedule", "plan my study", "make me a plan",
            "2-hour", "two-hour", "hour plan", "organize my", "schedule my",
            "what should i study", "study tonight", "study today",
        ),
    ),
    (
        Intent.PRIORITIZE,
        (
            "prioritize", "should i do first", "most important task", "what to do first",
            "start with", "focus on first", "work on first", "order should i",
            "tasks should i prioritize",
        ),
    ),
    (
        Intent.TASKS_DUE,
        (
            "what's due", "whats due", "due this week", "due today", "due tomorrow",
            "due soon", "upcoming", "deadline", "overdue", "what is due",
            "what are my deadlines", "due in the next",
        ),
    ),
    (
        Intent.NOTES,
        (
            "note", "summar", "revision", "revise", "lecture", "review my notes",
        ),
    ),
    (
        Intent.SUBJECT_FOCUS,
        (
            "how am i doing in", "how am i doing with", "my progress in",
            "progress in", "studying for", "preparing for", "prepare for",
            "exam in", "test in", "struggling with", "doing badly in",
        ),
    ),
    (
        Intent.STUDY_STATS,
        (
            "how much did i study", "how long did i study", "study time",
            "my streak", "how am i progressing", "how am i doing overall",
            "how am i doing", "productivity", "analytics", "my stats",
            "weekly goal",
        ),
    ),
]

# Which context sections each intent actually needs. Keeps payloads small.
INTENT_SECTIONS: dict[str, set[str]] = {
    Intent.TASKS_DUE: {"tasks", "subjects", "analytics"},
    Intent.PRIORITIZE: {"tasks", "subjects", "study_sessions", "analytics"},
    Intent.STUDY_PLAN: {"tasks", "subjects", "study_sessions", "analytics"},
    Intent.SUBJECT_FOCUS: {"tasks", "subjects", "study_sessions", "analytics", "notes"},
    Intent.NOTES: {"notes", "subjects", "tasks"},
    Intent.STUDY_STATS: {"study_sessions", "subjects", "analytics"},
    Intent.GENERAL: {"subjects", "analytics"},
}

TASK_LIMIT = 15
SESSION_LIMIT = 10
NOTE_LIMIT = 5
NOTE_CONTENT_CAP = 400
DESCRIPTION_CAP = 160

STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "my", "me", "i", "am", "is", "are",
    "on", "in", "for", "to", "of", "with", "what", "how", "do", "did", "should",
    "study", "studying", "tasks", "task", "notes", "note", "subject", "today",
    "tonight", "this", "week", "please", "help", "make", "give", "summarize",
}


def detect_intent(message: str) -> str:
    """Classify a user message into one of the Intent values (pure function)."""
    text = " ".join(message.lower().split())
    for intent, keywords in INTENT_RULES:
        if any(kw in text for kw in keywords):
            return intent
    return Intent.GENERAL


def extract_subject_mention(message: str, subjects: list[Subject]) -> Subject | None:
    """Return the first subject explicitly mentioned in the message, if any."""
    text = message.lower()
    for s in subjects:
        if s.code and s.code.lower() in text:
            return s
    for s in subjects:
        if s.name and _name_matches(s.name, text):
            return s
    return None


def _name_matches(name: str, text: str) -> bool:
    """True if the subject name (or its leading significant words) appears."""
    lowered = name.lower()
    if lowered in text:
        return True
    tokens = [w for w in lowered.split() if w.isalnum() and w not in STOPWORDS]
    if not tokens:
        return False
    for size in (min(2, len(tokens)), len(tokens)):
        if " ".join(tokens[:size]) in text:
            return True
    return False


def _as_utc_naive(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone().replace(tzinfo=None)
    return value


def _today_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _fmt(d: Any) -> str:
    return d.isoformat() if d is not None else None


def _subject_dict(s: Subject) -> dict[str, Any]:
    return {
        "code": s.code,
        "name": s.name,
        "progress": s.progress,
        "credits": s.credits,
        "semester": s.semester,
        "grade": s.grade,
        "instructor": s.instructor,
    }


def _task_dict(t: Task, subjects_by_id: dict[str, Subject]) -> dict[str, Any]:
    subject = subjects_by_id.get(t.subject_id)
    return {
        "title": t.title,
        "description": (t.description or "")[:DESCRIPTION_CAP],
        "status": t.status,
        "priority": t.priority,
        "due_date": _fmt(t.due_date),
        "subject": f"{subject.code} · {subject.name}" if subject else None,
        "estimated_minutes": t.estimated_minutes,
    }


def _note_dict(n: Note, subjects_by_id: dict[str, Subject]) -> dict[str, Any]:
    subject = subjects_by_id.get(n.subject_id)
    return {
        "title": n.title,
        "content": (n.content or "")[:NOTE_CONTENT_CAP],
        "subject": f"{subject.code} · {subject.name}" if subject else None,
        "pinned": n.pinned,
    }


def _study_stats(db: Session, user_id: str, subject_id: str | None = None, window_days: int = 14) -> dict[str, Any]:
    """Compact study analytics: window totals, streak, per-subject minutes."""
    query = select(StudySession).where(
        StudySession.user_id == user_id,
        StudySession.completed.is_(True),
        StudySession.session_type == "focus",
    )
    if subject_id:
        query = query.where(StudySession.subject_id == subject_id)
    sessions = list(db.scalars(query.order_by(StudySession.started_at.desc()).limit(300)).all())

    now = _today_naive()
    window_start = now - timedelta(days=window_days)

    total_minutes = 0
    week_minutes = 0
    window_minutes = 0
    session_dates: set[str] = set()
    per_subject_minutes: dict[str, int] = {}

    for s in sessions:
        started = _as_utc_naive(s.started_at)
        if started is None:
            continue
        if subject_id is None and s.subject_id:
            per_subject_minutes[s.subject_id] = per_subject_minutes.get(s.subject_id, 0) + (s.duration_minutes or 0)
        total_minutes += s.duration_minutes or 0
        day = started.strftime("%Y-%m-%d")
        session_dates.add(day)
        if started >= window_start:
            window_minutes += s.duration_minutes or 0
        if started >= now - timedelta(days=7):
            week_minutes += s.duration_minutes or 0

    streak = 0
    cursor = now
    while True:
        day = cursor.strftime("%Y-%m-%d")
        if day in session_dates:
            streak += 1
            cursor -= timedelta(days=1)
        else:
            if streak == 0 and day == now.strftime("%Y-%m-%d"):
                cursor -= timedelta(days=1)
                if cursor.strftime("%Y-%m-%d") in session_dates:
                    streak += 1
                    cursor -= timedelta(days=1)
                    continue
            break

    return {
        "sessions_in_window": sum(1 for s in sessions if (_as_utc_naive(s.started_at) or now) >= window_start),
        "window_minutes": window_minutes,
        "week_minutes": week_minutes,
        "total_minutes": total_minutes,
        "streak_days": streak,
        "per_subject_minutes": per_subject_minutes,
    }


def _task_analytics(tasks: list[Task], subjects_by_id: dict[str, Subject]) -> dict[str, Any]:
    today = _today_naive().date()
    completed = 0
    in_progress = 0
    todo = 0
    overdue = 0
    for t in tasks:
        if t.status == "completed":
            completed += 1
        elif t.status == "in_progress":
            in_progress += 1
        else:
            todo += 1
        if t.status != "completed" and t.due_date and t.due_date < today:
            overdue += 1
    total = len(tasks)
    return {
        "total": total,
        "completed": completed,
        "in_progress": in_progress,
        "todo": todo,
        "overdue": overdue,
        "completion_rate": round((completed / total) * 100) if total else 0,
    }


class StudentContext:
    def __init__(self, data: dict[str, Any], labels: list[str]):
        self.data = data
        self.labels = labels


def _trim_to_budget(context: dict[str, Any], budget: int) -> None:
    """Drop the least important sections if the serialized context is too big."""
    import json

    serialized = json.dumps(context, default=str)
    if len(serialized) <= budget:
        return
    for section in ("notes", "study_sessions", "tasks"):
        if section in context and context[section]:
            context[section] = context[section][:1]
            serialized = json.dumps(context, default=str)
            if len(serialized) <= budget:
                return
    # Last resort: truncate remaining list contents.
    for section in ("notes", "study_sessions", "tasks"):
        if section in context and isinstance(context[section], list):
            context[section] = [r for r in context[section][:2]]


def build_student_context(db: Session, user_id: str, message: str) -> StudentContext:
    """Assemble a bounded, intent-aware context snapshot for the AI request.

    Every query is scoped to `user_id` so a user's AI context can never
    include another user's data.
    """
    intent = detect_intent(message)
    sections = INTENT_SECTIONS[intent]

    subjects = list(
        db.scalars(select(Subject).where(Subject.user_id == user_id).order_by(Subject.code.asc())).all()
    )
    subjects_by_id = {s.id: s for s in subjects}

    subject_mention = extract_subject_mention(message, subjects)
    subject_id = subject_mention.id if subject_mention else None

    context: dict[str, Any] = {"intent": intent}

    # Subjects — small entity list, included for almost every intent.
    if "subjects" in sections:
        context["subjects"] = [_subject_dict(s) for s in subjects]
        if subject_mention:
            context["subject_mentioned"] = _subject_dict(subject_mention)

    # Tasks — only where deadlines / prioritization matter.
    if "tasks" in sections:
        query = (
            select(Task)
            .where(Task.user_id == user_id)
            .order_by(
                (Task.status == "completed").asc(),
                Task.due_date.asc().nulls_last(),
                Task.created_at.desc(),
            )
        )
        if subject_id:
            query = query.where(Task.subject_id == subject_id)
        tasks = list(db.scalars(query.limit(TASK_LIMIT)).all())
        context["tasks"] = [_task_dict(t, subjects_by_id) for t in tasks]
        context["task_analytics"] = _task_analytics(tasks, subjects_by_id)

    # Study sessions / history.
    if "study_sessions" in sections:
        session_query = (
            select(StudySession)
            .where(StudySession.user_id == user_id)
            .order_by(StudySession.started_at.desc())
        )
        if subject_id:
            session_query = session_query.where(StudySession.subject_id == subject_id)
        sessions = list(db.scalars(session_query.limit(SESSION_LIMIT)).all())
        context["recent_sessions"] = [
            {
                "subject": (subjects_by_id.get(s.subject_id).name if s.subject_id else None),
                "duration_minutes": s.duration_minutes,
                "session_type": s.session_type,
                "completed": s.completed,
                "started_at": _fmt(_as_utc_naive(s.started_at)),
            }
            for s in sessions
        ]
        context["study"] = _study_stats(db, user_id, subject_id=subject_id)

    # Notes — only when explicitly requested (or subject revision).
    if "notes" in sections:
        note_query = (
            select(Note)
            .where(Note.user_id == user_id)
            .order_by(Note.updated_at.desc())
        )
        if subject_id:
            note_query = note_query.where(Note.subject_id == subject_id)
            notes = list(db.scalars(note_query.limit(NOTE_LIMIT)).all())
        else:
            keywords = _query_keywords(message)
            notes_candidates = list(db.scalars(note_query.limit(NOTE_LIMIT * 4)).all())
            notes = _rank_notes(notes_candidates, keywords, subjects_by_id, message)
        context["notes"] = [_note_dict(n, subjects_by_id) for n in notes]

    # Analytics summary — small, broadly useful.
    if "analytics" in sections:
        all_tasks = list(
            db.scalars(select(Task).where(Task.user_id == user_id)).all()
        )
        analytics = _task_analytics(all_tasks, subjects_by_id)
        analytics["study"] = _study_stats(db, user_id)
        analytics["subject_progress"] = [
            {"code": s.code, "name": s.name, "progress": s.progress} for s in subjects
        ]
        context["analytics"] = analytics

    _trim_to_budget(context, settings.ai_context_budget_chars)

    # Report which context sections were included (in canonical order),
    # regardless of whether the section has data — an empty section still
    # tells the model that information is unavailable.
    _SECTION_ORDER = ("subjects", "tasks", "study_sessions", "notes", "analytics")
    used = [section for section in _SECTION_ORDER if section in sections]
    return StudentContext(context, used)


def _query_keywords(message: str) -> set[str]:
    text = " ".join(message.lower().split())
    tokens = {t for t in text.replace("?", " ").replace(",", " ").split() if len(t) > 2 and t not in STOPWORDS}
    return tokens


def _rank_notes(
    notes: list[Note],
    keywords: set[str],
    subjects_by_id: dict[str, Subject],
    message: str,
) -> list[Note]:
    """Score notes by how relevant they are to the message's keywords/subjects."""
    text = message.lower()

    def score(n: Note) -> int:
        s = 0
        haystack = (n.title or "").lower()
        subject = subjects_by_id.get(n.subject_id)
        if subject:
            if subject.code and subject.code.lower() in text:
                s += 5
            if subject.name and subject.name.lower() in text:
                s += 5
            if subject.name:
                for word in subject.name.lower().split():
                    if word in haystack:
                        s += 2
                        break
        for kw in keywords:
            if kw in haystack or kw in (n.content or "").lower():
                s += 2
        return s

    ranked = sorted(notes, key=lambda n: (score(n), n.pinned), reverse=True)
    return [n for n in ranked if score(n) > 0][:NOTE_LIMIT] or ranked[:NOTE_LIMIT]