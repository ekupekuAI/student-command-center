"""Activity stream endpoints (scoped to the authenticated user)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import CurrentUser
from app.database.session import get_db
from app.models.activity import Activity
from app.schemas.activity import ActivityCreate, ActivityRead

router = APIRouter(prefix="/activities", tags=["activities"])


@router.get("", response_model=list[ActivityRead])
def list_activities(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Activity]:
    query = (
        select(Activity)
        .where(Activity.user_id == current_user.id)
        .order_by(Activity.timestamp.desc())
        .limit(limit)
    )
    return list(db.scalars(query).all())


@router.post("", response_model=ActivityRead, status_code=201)
def create_activity(
    payload: ActivityCreate, current_user: CurrentUser, db: Session = Depends(get_db)
) -> Activity:
    """Create a single activity record.

    Used by the one-time frontend migration to import the user's existing
    local activity history. During normal operation the server logs activity
    entries automatically; this endpoint never re-logs anything itself.
    """
    entry = Activity(user_id=current_user.id, **payload.model_dump(exclude_unset=True))
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry