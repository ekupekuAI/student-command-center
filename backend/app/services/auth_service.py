"""Authentication & profile business logic.

Dedicated module so no auth logic lives inside resource routers. Every helper
is deliberately quiet: passwords, hashes, and tokens are never logged.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token, hash_password, verify_password
from app.models.note import Note
from app.models.study_session import StudySession
from app.models.subject import Subject
from app.models.task import Task
from app.models.user import (
    ROLE_MASTER_ADMIN,
    STATUS_APPROVED,
    STATUS_PENDING,
    User,
)

logger = logging.getLogger(__name__)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def account_status_message(status: str) -> str:
    """Public, non-sensitive explanation for a user's account status."""
    if status == STATUS_PENDING:
        return (
            "Your account is pending admin approval. "
            "You will be able to sign in once an admin approves it."
        )
    if status == "rejected":
        return "Your account was rejected by an admin. Please contact support."
    return "Your account is not active yet."


class AuthServiceError(Exception):
    """Expected authentication failure carrying a public HTTP status."""

    def __init__(self, message: str, *, status_code: int):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def register(db: Session, name: str, email: str, password: str) -> User:
    normalized = normalize_email(email)
    existing = db.scalar(select(User).where(User.email == normalized))
    if existing is not None:
        raise AuthServiceError("An account with this email already exists.", status_code=409)
    # New accounts start in the pending queue and cannot log in until an
    # admin approves them.
    user = User(
        name=name,
        email=normalized,
        password_hash=hash_password(password),
        account_status=STATUS_PENDING,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AuthServiceError("An account with this email already exists.", status_code=409)
    db.refresh(user)
    return user


def ensure_admin(db: Session) -> User | None:
    """Idempotently create (or refresh) the master admin from configured env
    credentials. No-op unless ADMIN_EMAIL and ADMIN_PASSWORD are set. Never
    overwrites an existing admin's password — only role/status/name."""
    email = settings.admin_email
    password = settings.admin_password
    if not (email and password):
        return None
    normalized = normalize_email(email)
    user = db.scalar(select(User).where(User.email == normalized))
    if user is None:
        user = User(
            name=settings.admin_name or "Master Admin",
            email=normalized,
            password_hash=hash_password(password),
            role=ROLE_MASTER_ADMIN,
            account_status=STATUS_APPROVED,
        )
        db.add(user)
    else:
        user.role = ROLE_MASTER_ADMIN
        user.account_status = STATUS_APPROVED
        user.name = settings.admin_name or user.name
    db.commit()
    db.refresh(user)
    return user


def authenticate(db: Session, email: str, password: str) -> User | None:
    """Return the user for valid credentials, else None (identical for both
    'no such account' and 'wrong password' — no account enumeration)."""
    user = db.scalar(select(User).where(User.email == normalize_email(email)))
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


def issue_token(user: User) -> str:
    return create_access_token(user.id, user.token_version)


def logout(db: Session, user: User) -> None:
    """Revoke all previously issued tokens for this user."""
    user.token_version += 1
    db.commit()


def update_profile(db: Session, user: User, data: dict) -> User:
    for field, value in data.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise AuthServiceError("Current password is incorrect.", status_code=400)
    user.password_hash = hash_password(new_password)
    db.commit()


def _session_days(db: Session, user_id: str) -> set[date]:
    rows = db.scalars(
        select(StudySession.started_at).where(
            StudySession.user_id == user_id,
            StudySession.completed.is_(True),
        )
    ).all()
    days: set[date] = set()
    for ts in rows:
        if ts is None:
            continue
        if ts.tzinfo is not None:
            ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
        days.add(ts.date())
    return days


def _streak_days(days: set[date]) -> int:
    """Consecutive study days ending today (or yesterday if today is empty)."""
    streak = 0
    cursor = date.today()
    if cursor not in days:
        cursor -= timedelta(days=1)
    while cursor in days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def compute_profile_stats(db: Session, user: User) -> dict:
    user_id = user.id
    task_counts = dict(
        db.execute(
            select(Task.status, func.count()).where(Task.user_id == user_id).group_by(Task.status)
        ).all()
    )
    total_minutes = db.scalar(
        select(func.coalesce(func.sum(StudySession.duration_minutes), 0)).where(
            StudySession.user_id == user_id
        )
    ) or 0

    created = user.created_at
    if created.tzinfo is not None:
        created = created.astimezone(timezone.utc).replace(tzinfo=None)
    joined_days = max(1, (date.today() - created.date()).days + 1)

    return {
        "study_total_minutes": int(total_minutes),
        "study_sessions_count": db.scalar(
            select(func.count()).where(StudySession.user_id == user_id)
        ) or 0,
        "streak_days": _streak_days(_session_days(db, user_id)),
        "tasks_total": int(task_counts.get("todo", 0) + task_counts.get("in_progress", 0) + task_counts.get("completed", 0)),
        "tasks_completed": int(task_counts.get("completed", 0)),
        "tasks_in_progress": int(task_counts.get("in_progress", 0)),
        "tasks_todo": int(task_counts.get("todo", 0)),
        "subjects_count": db.scalar(select(func.count()).where(Subject.user_id == user_id)) or 0,
        "notes_count": db.scalar(select(func.count()).where(Note.user_id == user_id)) or 0,
        "joined_days": joined_days,
    }