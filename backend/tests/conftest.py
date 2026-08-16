"""Shared pytest fixtures.

The context service is tested against an in-memory SQLite database (no real
credentials, no network). The AI router is exercised with a mocked provider so
tests never call OpenRouter.
"""

from __future__ import annotations

from collections.abc import Generator

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  — registers all tables on Base.metadata
from app.database.base import Base


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    session = testing_session()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def user(db_session):
    """A persisted test user (created via the ORM, not the API)."""
    from app.core.security import hash_password
    from app.models.user import User

    test_user = User(
        name="Test User",
        email="test@example.com",
        password_hash=hash_password("correct-horse-battery"),
    )
    db_session.add(test_user)
    db_session.commit()
    db_session.refresh(test_user)
    return test_user


@pytest.fixture
def auth_headers(user, db_session):
    """Bearer token for the fixture user (issued server-side)."""
    from app.services.auth_service import issue_token

    return {"Authorization": f"Bearer {issue_token(user)}"}


@pytest.fixture
def client(db_session, user, monkeypatch):
    """FastAPI TestClient with a mocked AI provider and SQLite-backed DB."""
    from fastapi.testclient import TestClient

    from app.database.session import get_db
    from app.main import app
    from app.services.ai_service import ai_service

    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    def fake_chat(messages):
        return {
            "message": "Focus on your upcoming CS301 assignment first.",
            "model": "fake-model",
            "usage": {"prompt_tokens": 10, "completion_tokens": 8, "total_tokens": 18},
        }

    monkeypatch.setattr(ai_service, "chat", fake_chat)

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    monkeypatch.undo()


@pytest.fixture
def seeded_subject(db_session, user):
    """A realistic subject + linked tasks/notes/sessions owned by `user`."""
    from datetime import date, datetime, timedelta, timezone

    from app.models.note import Note
    from app.models.study_session import StudySession
    from app.models.subject import Subject
    from app.models.task import Task

    subject = Subject(
        user_id=user.id,
        code="CS301",
        name="Data Structures & Algorithms",
        instructor="Dr. Chen",
        credits=3,
        semester="Fall 2026",
        color="violet",
        accent="violet",
        progress=40,
        grade="B",
    )
    db_session.add(subject)
    db_session.flush()

    today = date.today()
    db_session.add_all([
        Task(
            user_id=user.id,
            title="Finish AVL tree homework",
            subject_id=subject.id,
            priority="high",
            status="todo",
            due_date=today + timedelta(days=1),
            estimated_minutes=60,
        ),
        Task(
            user_id=user.id,
            title="Overdue graph assignment",
            subject_id=subject.id,
            priority="high",
            status="todo",
            due_date=today - timedelta(days=2),
            estimated_minutes=90,
        ),
        Task(
            user_id=user.id,
            title="Finished sorting notes",
            subject_id=subject.id,
            priority="low",
            status="completed",
            due_date=today - timedelta(days=5),
        ),
        Task(
            user_id=user.id,
            title="General research task",
            subject_id=None,
            priority="medium",
            status="todo",
            due_date=today + timedelta(days=7),
        ),
    ])

    db_session.add(Note(
        user_id=user.id,
        title="AVL Rotations & Invariants",
        content="Single and double rotations, balance factors, worst-case O(log n).",
        subject_id=subject.id,
        pinned=True,
    ))
    db_session.add(Note(
        user_id=user.id,
        title="Sorting algorithms comparison",
        content="Quicksort vs mergesort: stability, memory, worst cases.",
        subject_id=subject.id,
    ))

    db_session.add_all([
        StudySession(
            user_id=user.id,
            subject_id=subject.id,
            duration_minutes=50,
            started_at=datetime.now(timezone.utc) - timedelta(hours=3),
            completed_at=datetime.now(timezone.utc) - timedelta(hours=2),
            session_type="focus",
            completed=True,
        ),
        StudySession(
            user_id=user.id,
            subject_id=subject.id,
            duration_minutes=30,
            started_at=datetime.now(timezone.utc) - timedelta(days=1),
            completed_at=datetime.now(timezone.utc) - timedelta(days=1),
            session_type="focus",
            completed=True,
        ),
    ])

    db_session.commit()
    return subject