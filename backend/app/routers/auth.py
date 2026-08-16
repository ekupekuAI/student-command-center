"""Authentication endpoints.

Registration, login, logout, current-user retrieval, profile updates, and
password changes. Never returns password hashes, tokens, or secrets. Login
failures are intentionally generic ("Invalid email or password") so the API
does not reveal whether an email exists.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.rate_limit import rate_limit_by_ip
from app.core.security import CurrentUser
from app.database.session import get_db
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    ProfileStats,
    ProfileUpdate,
    RegisterRequest,
    UserRead,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

# Per-IP brute-force protection for credential entry points.
_auth_guard = Depends(
    rate_limit_by_ip("auth", settings.auth_rate_limit_per_minute, 60)
)


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(
    payload: RegisterRequest,
    db: Session = Depends(get_db),
    _: None = _auth_guard,
) -> AuthResponse:
    try:
        user = auth_service.register(db, payload.name, payload.email, payload.password)
    except auth_service.AuthServiceError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)
    return AuthResponse(access_token=auth_service.issue_token(user), user=user)


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
    _: None = _auth_guard,
) -> AuthResponse:
    user = auth_service.authenticate(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return AuthResponse(access_token=auth_service.issue_token(user), user=user)


@router.post("/logout", status_code=204)
def logout(current_user: CurrentUser, db: Session = Depends(get_db)) -> None:
    auth_service.logout(db, current_user)


@router.get("/me", response_model=UserRead)
def me(current_user: CurrentUser) -> User:
    return current_user


@router.patch("/me", response_model=UserRead)
def update_me(
    payload: ProfileUpdate, current_user: CurrentUser, db: Session = Depends(get_db)
) -> User:
    return auth_service.update_profile(db, current_user, payload.model_dump(exclude_unset=True))


@router.post("/change-password", status_code=204)
def change_password(
    payload: ChangePasswordRequest, current_user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    try:
        auth_service.change_password(
            db, current_user, payload.current_password, payload.new_password
        )
    except auth_service.AuthServiceError as err:
        raise HTTPException(status_code=err.status_code, detail=err.message)


@router.get("/me/stats", response_model=ProfileStats)
def my_stats(current_user: CurrentUser, db: Session = Depends(get_db)) -> ProfileStats:
    return ProfileStats(**auth_service.compute_profile_stats(db, current_user))