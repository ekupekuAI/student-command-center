"""Tests for the intent-aware context builder.

These run against an in-memory SQLite DB and never touch the network or real
credentials.
"""

from __future__ import annotations

from app.services.context_service import (
    Intent,
    build_student_context,
    detect_intent,
    extract_subject_mention,
)


def test_detect_intent_examples():
    cases = {
        "What's due this week?": Intent.TASKS_DUE,
        "What tasks should I prioritize?": Intent.PRIORITIZE,
        "Make me a 2-hour study plan.": Intent.STUDY_PLAN,
        "How am I doing in Data Structures?": Intent.SUBJECT_FOCUS,
        "Summarize my notes on Data Structures": Intent.NOTES,
        "How much did I study this week?": Intent.STUDY_STATS,
        "What is the capital of France?": Intent.GENERAL,
    }
    for message, expected in cases.items():
        assert detect_intent(message) == expected, message


def test_detect_intent_general_defaults():
    assert detect_intent("hello there") == Intent.GENERAL
    assert detect_intent("") == Intent.GENERAL


def test_extract_subject_mention_by_name(seeded_subject, db_session):
    from app.models.subject import Subject
    from sqlalchemy import select

    subjects = list(db_session.scalars(select(Subject)).all())
    found = extract_subject_mention("How am I doing in Data Structures?", subjects)
    assert found is not None
    assert found.id == seeded_subject.id


def test_extract_subject_mention_by_code(seeded_subject, db_session):
    from app.models.subject import Subject
    from sqlalchemy import select

    subjects = list(db_session.scalars(select(Subject)).all())
    found = extract_subject_mention("revise CS301 before the exam", subjects)
    assert found is not None
    assert found.id == seeded_subject.id


def test_extract_subject_mention_none(db_session):
    assert extract_subject_mention("What should I study tonight?", []) is None


def test_context_study_plan_sections(seeded_subject, user, db_session):
    context = build_student_context(db_session, user.id, "Make me a 2-hour study plan")
    assert "tasks" in context.labels
    assert "study_sessions" in context.labels
    assert "subjects" in context.labels
    assert "analytics" in context.labels
    assert "notes" not in context.labels

    # Tasks are present and incomplete ones are included.
    titles = [t["title"] for t in context.data["tasks"]]
    assert "Finish AVL tree homework" in titles
    assert "Overdue graph assignment" in titles

    # Study data is grounded.
    assert context.data["study"]["total_minutes"] >= 80
    assert context.data["study"]["streak_days"] >= 1


def test_context_subject_focus_uses_mention(seeded_subject, user, db_session):
    context = build_student_context(db_session, user.id, "How am I doing in Data Structures?")
    assert context.data.get("subject_mentioned", {}).get("code") == "CS301"
    assert context.data["analytics"]["subject_progress"]
    assert any(s["code"] == "CS301" for s in context.data["analytics"]["subject_progress"])


def test_context_notes_section(seeded_subject, user, db_session):
    context = build_student_context(db_session, user.id, "Summarize my notes on Data Structures")
    assert "notes" in context.labels
    assert context.data["notes"]
    assert any(n["title"] == "AVL Rotations & Invariants" for n in context.data["notes"])


def test_context_general_is_minimal(user, db_session):
    context = build_student_context(db_session, user.id, "Hello, how can you help?")
    # Minimal context: subjects + analytics only. No big sections.
    assert "tasks" not in context.labels
    assert "notes" not in context.labels
    assert "study_sessions" not in context.labels
    assert "subjects" in context.labels
    assert "analytics" in context.labels


def test_context_no_secrets_leaked(seeded_subject, user, db_session):
    import json

    context = build_student_context(db_session, user.id, "What should I study today?")
    raw = json.dumps(context.data, default=str).lower()
    assert "password" not in raw
    assert "api_key" not in raw
    assert "openrouter" not in raw
    assert "database_url" not in raw