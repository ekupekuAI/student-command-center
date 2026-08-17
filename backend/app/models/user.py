"""User ORM model (authentication + ownership root).

Every user-owned entity (subjects, tasks, notes, study sessions, activities)
carries a `user_id` foreign key back to this table. Deleting a user cascades
to their own data only.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


def _uuid() -> str:
    return uuid.uuid4().hex


# Roles, ordered by privilege.
ROLE_USER = "user"
ROLE_ADMIN = "admin"
ROLE_MASTER_ADMIN = "master_admin"

# Account approval gate for new registrations.
STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # RBAC role: ROLE_USER / ROLE_ADMIN / ROLE_MASTER_ADMIN.
    role: Mapped[str] = mapped_column(String(20), nullable=False, server_default=ROLE_USER)
    # Approval gate: STATUS_PENDING / STATUS_APPROVED / STATUS_REJECTED.
    # New registrations are created as pending; only approved accounts can log in.
    account_status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=STATUS_PENDING
    )
    # Bumped on logout so previously-issued JWTs become invalid server-side.
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Total successful logins (used on the admin console).
    login_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", default=0
    )
    # Timestamp of the most recent successful login.
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    subjects = relationship("Subject", back_populates="user", passive_deletes=True)
    tasks = relationship("Task", back_populates="user", passive_deletes=True)
    notes = relationship("Note", back_populates="user", passive_deletes=True)
    study_sessions = relationship("StudySession", back_populates="user", passive_deletes=True)
    activities = relationship("Activity", back_populates="user", passive_deletes=True)