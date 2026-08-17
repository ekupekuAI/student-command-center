"""Authentication & profile schemas.

Only non-sensitive user data is ever exposed: never a password hash, token
payload, or internal auth data.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

PASSWORD_MIN = 8


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN, max_length=128)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: EmailStr
    avatar_url: str | None
    role: str
    account_status: str
    created_at: datetime
    updated_at: datetime


class RegisterResponse(BaseModel):
    """Returned when a new account is created. No token is issued: the account
    is pending and cannot log in until an admin approves it."""

    user: UserRead
    message: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserRead


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    avatar_url: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped

    @field_validator("avatar_url")
    @classmethod
    def clean_avatar(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        return stripped or None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=128)


class ProfileStats(BaseModel):
    study_total_minutes: int
    study_sessions_count: int
    streak_days: int
    tasks_total: int
    tasks_completed: int
    tasks_in_progress: int
    tasks_todo: int
    subjects_count: int
    notes_count: int
    joined_days: int


class AdminUserUpdate(BaseModel):
    """Admin-only partial update of another account (role/status/identity)."""

    model_config = ConfigDict(extra="ignore")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    role: Literal["user", "admin", "master_admin"] | None = None
    account_status: Literal["pending", "approved", "rejected"] | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        stripped = value.strip()
        if not stripped:
            raise ValueError("name must not be blank")
        return stripped


class AdminResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=128)


class AdminActivityItem(BaseModel):
    """One entry in the admin's activity stream."""

    action: str
    detail: str
    created_at: datetime


class AdminCounts(BaseModel):
    total: int
    pending: int
    approved: int
    rejected: int
    admins: int


class AdminOverview(BaseModel):
    """Admin console summary — login tracking, account counts, recent actions."""

    login_count: int
    last_login_at: datetime | None
    created_at: datetime
    counts: AdminCounts
    activity: list[AdminActivityItem]