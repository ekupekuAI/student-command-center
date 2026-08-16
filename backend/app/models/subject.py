"""Subject ORM model."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


def _uuid() -> str:
    return uuid.uuid4().hex


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    code: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    instructor: Mapped[str] = mapped_column(String(120), nullable=False, default="TBA")
    credits: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    semester: Mapped[str] = mapped_column(String(40), nullable=False, default="Fall 2026")
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="violet")
    accent: Mapped[str] = mapped_column(String(20), nullable=False, default="violet")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    grade: Mapped[str] = mapped_column(String(20), nullable=False, default="In Progress")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Child rows preserve their own data when the subject is deleted:
    # the database sets their subject_id to NULL (no cascade delete).
    user = relationship("User", back_populates="subjects")
    tasks = relationship("Task", back_populates="subject", passive_deletes=True)
    notes = relationship("Note", back_populates="subject", passive_deletes=True)
    study_sessions = relationship(
        "StudySession", back_populates="subject", passive_deletes=True
    )