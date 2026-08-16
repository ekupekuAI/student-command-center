"""Subject CRUD endpoints (scoped to the authenticated user).

Deleting a subject keeps all linked tasks, notes, and study sessions: their
`subject_id` is set to NULL by the database (FK ON DELETE SET NULL). User data
is never cascade-deleted. Users can never read, modify, or delete another
user's subjects — every lookup is ownership-checked.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import CurrentUser
from app.database.session import get_db
from app.models.subject import Subject
from app.schemas.subject import SubjectCreate, SubjectRead, SubjectUpdate
from app.services.activity_log import log_activity

router = APIRouter(prefix="/subjects", tags=["subjects"])


def _get_owned(db: Session, user_id: str, subject_id: str) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None or subject.user_id != user_id:
        raise HTTPException(status_code=404, detail="Subject not found")
    return subject


@router.get("", response_model=list[SubjectRead])
def list_subjects(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    search: str | None = Query(default=None),
    semester: str | None = Query(default=None),
) -> list[Subject]:
    query = select(Subject).where(Subject.user_id == current_user.id).order_by(Subject.code.asc())

    if semester:
        query = query.where(Subject.semester == semester)
    if search:
        like = f"%{search.strip()}%"
        query = query.where(
            Subject.name.ilike(like) | Subject.code.ilike(like) | Subject.instructor.ilike(like)
        )

    return list(db.scalars(query).all())


@router.get("/{subject_id}", response_model=SubjectRead)
def get_subject(subject_id: str, current_user: CurrentUser, db: Session = Depends(get_db)) -> Subject:
    return _get_owned(db, current_user.id, subject_id)


@router.post("", response_model=SubjectRead, status_code=201)
def create_subject(
    payload: SubjectCreate, request: Request, current_user: CurrentUser, db: Session = Depends(get_db)
) -> Subject:
    data = payload.model_dump()
    if not data.get("accent"):
        data["accent"] = data.get("color", "violet")
    subject = Subject(user_id=current_user.id, **data)
    db.add(subject)
    db.flush()
    log_activity(
        db,
        request,
        user_id=current_user.id,
        type="subject_create",
        label="Course Added",
        text=f"Enrolled in \"{subject.code} · {subject.name}\" ({subject.credits} cr)",
        accent=subject.color,
    )
    db.commit()
    db.refresh(subject)
    return subject


@router.patch("/{subject_id}", response_model=SubjectRead)
def update_subject(
    subject_id: str,
    payload: SubjectUpdate,
    request: Request,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> Subject:
    subject = _get_owned(db, current_user.id, subject_id)

    data = payload.model_dump(exclude_unset=True)
    if "color" in data and "accent" not in data:
        data["accent"] = data["color"]

    for field, value in data.items():
        setattr(subject, field, value)

    db.flush()
    log_activity(
        db,
        request,
        user_id=current_user.id,
        type="subject_update",
        label="Course Updated",
        text=f"Updated details for \"{subject.code} · {subject.name}\"",
        accent=subject.color,
    )
    db.commit()
    db.refresh(subject)
    return subject


@router.delete("/{subject_id}", status_code=204)
def delete_subject(
    subject_id: str, request: Request, current_user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    subject = _get_owned(db, current_user.id, subject_id)
    code = subject.code
    name = subject.name
    # ON DELETE SET NULL on the child FKs keeps all linked user data intact.
    db.flush()
    log_activity(
        db,
        request,
        user_id=current_user.id,
        type="subject_delete",
        label="Course Removed",
        text=f"Removed course \"{code} · {name}\"",
        accent="red",
    )
    db.delete(subject)
    db.commit()