"""Admin & master-admin endpoints.

Role model:
  - `user`          — standard account (pending → approved/rejected by an admin)
  - `admin`         — approves/rejects users, resets passwords, edits/deletes users
  - `master_admin`  — everything an admin can do, plus managing admin roles

Guards:
  - `require_admin` / `require_master_admin` come from core.security.
  - A regular admin can never touch admin or master-admin accounts.
  - No one can delete their own account; master admins cannot manage another
    master admin. Admin endpoints never return password hashes or secrets.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import AdminUser, MasterAdminUser
from app.database.session import get_db
from app.models.user import (
    ROLE_ADMIN,
    ROLE_MASTER_ADMIN,
    ROLE_USER,
    STATUS_APPROVED,
    STATUS_REJECTED,
    User,
)
from app.schemas.auth import AdminResetPasswordRequest, AdminUserUpdate, UserRead
from app.services import auth_service

router = APIRouter(prefix="/admin", tags=["admin"])


def _get_user_or_404(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _guard_target(actor: User, target: User) -> None:
    """Enforce who may manage whom."""
    if target.id == actor.id:
        return
    if actor.role != ROLE_MASTER_ADMIN:
        if target.role != ROLE_USER:
            raise HTTPException(
                status_code=403,
                detail="Only a master admin can manage admin or master admin accounts.",
            )
    elif target.role == ROLE_MASTER_ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Another master admin account cannot be managed.",
        )


@router.get("/users", response_model=list[UserRead])
def list_users(
    current_user: AdminUser,
    status: str | None = None,
    db: Session = Depends(get_db),
) -> list[User]:
    """List all users, optionally filtered by account status."""
    query = select(User)
    if status:
        query = query.where(User.account_status == status)
    query = query.order_by(User.created_at.desc())
    return list(db.scalars(query).all())


@router.post("/users/{user_id}/approve", response_model=UserRead)
def approve_user(
    user_id: str,
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> User:
    """Approve a pending (or re-activate a rejected) account."""
    target = _get_user_or_404(db, user_id)
    _guard_target(current_user, target)
    if target.account_status == STATUS_APPROVED:
        return target
    target.account_status = STATUS_APPROVED
    db.commit()
    db.refresh(target)
    return target


@router.post("/users/{user_id}/reject", response_model=UserRead)
def reject_user(
    user_id: str,
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> User:
    """Reject an account; any previously issued tokens are revoked immediately."""
    target = _get_user_or_404(db, user_id)
    _guard_target(current_user, target)
    if target.account_status == STATUS_REJECTED:
        return target
    target.account_status = STATUS_REJECTED
    target.token_version += 1
    db.commit()
    db.refresh(target)
    return target


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: str,
    payload: AdminUserUpdate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> User:
    """Edit identity, role, or account status of another user."""
    target = _get_user_or_404(db, user_id)
    _guard_target(current_user, target)
    data = payload.model_dump(exclude_unset=True)

    if (
        data.get("role") == ROLE_MASTER_ADMIN
        and target.role == ROLE_MASTER_ADMIN
        and target.id != current_user.id
    ):
        raise HTTPException(status_code=403, detail="Another master admin cannot be managed.")

    if data.get("email"):
        email = auth_service.normalize_email(data["email"])
        duplicate = db.scalar(select(User).where(User.email == email, User.id != target.id))
        if duplicate is not None:
            raise HTTPException(status_code=409, detail="That email is already in use.")
        data["email"] = email

    for field, value in data.items():
        setattr(target, field, value)

    if target.account_status == STATUS_REJECTED:
        target.token_version += 1

    db.commit()
    db.refresh(target)
    return target


@router.post("/users/{user_id}/reset-password", status_code=204)
def reset_password(
    user_id: str,
    payload: AdminResetPasswordRequest,
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> None:
    """Force a new password and revoke the target's existing tokens."""
    target = _get_user_or_404(db, user_id)
    _guard_target(current_user, target)
    target.password_hash = auth_service.hash_password(payload.new_password)
    target.token_version += 1
    db.commit()


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: str,
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> None:
    """Permanently delete an account and all of its data (cascading)."""
    target = _get_user_or_404(db, user_id)
    _guard_target(current_user, target)
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    db.delete(target)
    db.commit()


# ── Master-admin-only: role management ──────────────────────────

@router.post("/users/{user_id}/role", response_model=UserRead)
def set_role(
    user_id: str,
    role: str,
    current_user: MasterAdminUser,
    db: Session = Depends(get_db),
) -> User:
    """Master admin: promote/demote a user (role in user/admin/master_admin)."""
    if role not in (ROLE_USER, ROLE_ADMIN, ROLE_MASTER_ADMIN):
        raise HTTPException(status_code=422, detail="Invalid role.")
    target = _get_user_or_404(db, user_id)
    if target.id == current_user.id and role != ROLE_MASTER_ADMIN:
        raise HTTPException(
            status_code=400,
            detail="A master admin cannot remove their own role.",
        )
    if target.role == ROLE_MASTER_ADMIN and target.id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Another master admin account cannot be managed.",
        )
    target.role = role
    db.commit()
    db.refresh(target)
    return target