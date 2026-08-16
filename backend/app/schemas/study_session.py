"""Study session request/response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SESSION_TYPES = {"focus", "short_break", "long_break"}


def _clean_optional_subject(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class StudySessionCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    subject_id: str | None = None
    duration_minutes: int = Field(ge=1, le=1440)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    session_type: Literal["focus", "short_break", "long_break"] = "focus"
    completed: bool = True
    notes: str = Field(default="", max_length=10000)

    @field_validator("subject_id")
    @classmethod
    def clean_subject(cls, value: str | None) -> str | None:
        return _clean_optional_subject(value)


class StudySessionRead(StudySessionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    started_at: datetime | None
    created_at: datetime