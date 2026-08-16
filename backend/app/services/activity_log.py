"""Activity logging helper for database mutations.

Activity records are created here (server-side) so there is exactly ONE
authoritative source for the activity stream. Requests made by the frontend
migration uploader send `X-Migration: 1`, which suppresses activity logging
so importing existing local history does not produce duplicate entries.
"""

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.activity import Activity


def should_log(request: Request) -> bool:
    """Migration uploads carry a marker header and must not be logged."""
    return request.headers.get("x-migration", "").strip() not in ("1", "true")


def log_activity(
    db: Session,
    request: Request,
    *,
    user_id: str,
    type: str,
    label: str,
    text: str,
    accent: str = "blue",
) -> Activity | None:
    """Insert an activity row (in the caller's transaction) unless skipped."""
    if not should_log(request):
        return None
    entry = Activity(user_id=user_id, type=type, label=label, text=text, accent=accent)
    db.add(entry)
    return entry