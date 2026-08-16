"""Note request/response schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _clean_optional_subject(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class NoteBase(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=20000)
    subject_id: str | None = None
    pinned: bool = False

    @field_validator("title", "content")
    @classmethod
    def strip_required(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("subject_id")
    @classmethod
    def clean_subject(cls, value: str | None) -> str | None:
        return _clean_optional_subject(value)


class NoteCreate(NoteBase):
    pass


class NoteUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    content: str | None = Field(default=None, min_length=1, max_length=20000)
    subject_id: str | None = None
    pinned: bool | None = None

    @field_validator("title", "content")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("subject_id")
    @classmethod
    def clean_subject(cls, value: str | None) -> str | None:
        return _clean_optional_subject(value)


class NoteRead(NoteBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: datetime
    updated_at: datetime