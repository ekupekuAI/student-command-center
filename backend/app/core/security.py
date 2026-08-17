"""Password hashing, JWT issuance/verification, and the auth dependency.

Security-sensitive and deliberately isolated: nothing here ever logs passwords,
tokens, or hashes, and no credentials are returned to callers.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db
from app.models.user import (
    ROLE_ADMIN,
    STATUS_APPROVED,
    User,
)

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt (salt embedded in the hash)."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Constant-time-ish bcrypt verification; never raises on malformed hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: str, token_version: int) -> str:
    """Issue a signed JWT bound to the user's current token_version."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "ver": token_version,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT; raises jwt.PyJWTError when invalid/expired."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    """Resolve the authenticated user or raise 401.

    The same generic 401 is returned for missing, malformed, expired, or
    revoked tokens so callers cannot distinguish token states.
    """
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise unauthorized
    try:
        payload = decode_token(credentials.credentials)
    except jwt.PyJWTError:
        raise unauthorized

    user_id = payload.get("sub")
    token_version = payload.get("ver")
    token_type = payload.get("type")
    if not user_id or not isinstance(token_version, int) or token_type != "access":
        raise unauthorized

    user = db.get(User, user_id)
    # Reject tokens issued before the user's current token_version (logout).
    if user is None or user.token_version != token_version:
        raise unauthorized
    # Accounts that are not approved (pending/rejected) can never use an API
    # token, even one that was issued earlier.
    if user.account_status != STATUS_APPROVED:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def _require_role(user: User, *roles: str) -> User:
    if user.role not in roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action.",
        )
    return user


def require_admin(user: CurrentUser) -> User:
    """Allow any admin through (the single privileged role)."""
    return _require_role(user, ROLE_ADMIN)


AdminUser = Annotated[User, Depends(require_admin)]