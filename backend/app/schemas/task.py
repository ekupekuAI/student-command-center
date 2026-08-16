"""Task request/response schemas.

Status is the single source of truth for completion
(todo | in_progress | completed) — there is no `done` field.
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PRIORITY_VALUES = {"high", "medium", "low"}
STATUS_VALUES = {"todo", "in_progress", "completed"}


def _clean_optional_subject(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    subject_id: str | None = None
    priority: Literal["high", "medium", "low"] = "medium"
    status: Literal["todo", "in_progress", "completed"] = "todo"
    due_date: date | None = None
    estimated_minutes: int | None = Field(default=None, ge=1, le=1440)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("title must not be blank")
        return stripped

    @field_validator("subject_id")
    @classmethod
    def clean_subject(cls, value: str | None) -> str | None:
        return _clean_optional_subject(value)


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    subject_id: str | None = None
    priority: Literal["high", "medium", "low"] | None = None
    status: Literal["todo", "in_progress", "completed"] | None = None
    due_date: date | None = None
    estimated_minutes: int | None = Field(default=None, ge=1, le=1440)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("title must not be blank")
        return stripped

    @field_validator("subject_id")
    @classmethod
    def clean_subject(cls, value: str | None) -> str | None:
        return _clean_optional_subject(value)


class TaskRead(TaskBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime