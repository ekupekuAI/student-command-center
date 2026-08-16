"""Subject request/response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SUBJECT_COLORS = {"violet", "blue", "cyan", "green", "yellow", "orange", "red", "pink"}


class SubjectBase(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=120)
    instructor: str = Field(default="TBA", max_length=120)
    credits: int = Field(default=3, ge=1, le=20)
    semester: str = Field(default="Fall 2026", max_length=40)
    color: str = Field(default="violet", max_length=20)
    accent: str | None = None
    progress: int = Field(default=0, ge=0, le=100)
    grade: str = Field(default="In Progress", max_length=20)

    @field_validator("code", "name")
    @classmethod
    def strip_required(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("color", "accent")
    @classmethod
    def validate_color(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in SUBJECT_COLORS:
            raise ValueError(f"color must be one of: {', '.join(sorted(SUBJECT_COLORS))}")
        return value


class SubjectCreate(SubjectBase):
    pass


class SubjectUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    code: str | None = Field(default=None, min_length=1, max_length=20)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    instructor: str | None = Field(default=None, max_length=120)
    credits: int | None = Field(default=None, ge=1, le=20)
    semester: str | None = Field(default=None, max_length=40)
    color: str | None = Field(default=None, max_length=20)
    accent: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    grade: str | None = Field(default=None, max_length=20)

    @field_validator("code", "name")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("must not be blank")
        return stripped

    @field_validator("color", "accent")
    @classmethod
    def validate_color(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in SUBJECT_COLORS:
            raise ValueError(f"color must be one of: {', '.join(sorted(SUBJECT_COLORS))}")
        return value


class SubjectRead(SubjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    accent: str | None
    created_at: datetime
    updated_at: datetime