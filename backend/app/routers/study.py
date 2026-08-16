"""Study session endpoints (scoped to the authenticated user)."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import CurrentUser
from app.database.session import get_db
from app.models.study_session import StudySession
from app.models.subject import Subject
from app.schemas.study_session import StudySessionCreate, StudySessionRead
from app.services.activity_log import log_activity

router = APIRouter(prefix="/study-sessions", tags=["study-sessions"])


def _ensure_subject_exists(db: Session, user_id: str, subject_id: str | None) -> None:
    if subject_id is None:
        return
    subject = db.get(Subject, subject_id)
    if subject is None or subject.user_id != user_id:
        raise HTTPException(status_code=400, detail=f"Subject '{subject_id}' does not exist")


def _get_owned(db: Session, user_id: str, session_id: str) -> StudySession:
    session = db.get(StudySession, session_id)
    if session is None or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="Study session not found")
    return session


@router.get("", response_model=list[StudySessionRead])
def list_study_sessions(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    subject_id: str | None = Query(default=None),
    session_type: str | None = Query(default=None),
) -> list[StudySession]:
    query = (
        select(StudySession)
        .where(StudySession.user_id == current_user.id)
        .order_by(StudySession.started_at.desc())
    )

    if subject_id:
        query = query.where(StudySession.subject_id == subject_id)
    if session_type:
        query = query.where(StudySession.session_type == session_type)

    return list(db.scalars(query).all())


@router.get("/{session_id}", response_model=StudySessionRead)
def get_study_session(
    session_id: str, current_user: CurrentUser, db: Session = Depends(get_db)
) -> StudySession:
    return _get_owned(db, current_user.id, session_id)


@router.post("", response_model=StudySessionRead, status_code=201)
def create_study_session(
    payload: StudySessionCreate,
    request: Request,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> StudySession:
    _ensure_subject_exists(db, current_user.id, payload.subject_id)
    session = StudySession(user_id=current_user.id, **payload.model_dump(exclude_unset=True))
    db.add(session)
    db.flush()
    if session.completed and session.session_type == "focus":
        subject = db.get(Subject, session.subject_id) if session.subject_id else None
        subject_name = subject.name if subject and subject.user_id == current_user.id else "General"
        log_activity(
            db,
            request,
            user_id=current_user.id,
            type="session",
            label="Study Session",
            text=f"Completed {session.duration_minutes}m study session on {subject_name}",
            accent="violet",
        )
    db.commit()
    db.refresh(session)
    return session


@router.delete("/{session_id}", status_code=204)
def delete_study_session(
    session_id: str, current_user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    session = _get_owned(db, current_user.id, session_id)
    db.delete(session)
    db.commit()