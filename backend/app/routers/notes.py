"""Note CRUD endpoints (scoped to the authenticated user)."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import CurrentUser
from app.database.session import get_db
from app.models.note import Note
from app.models.subject import Subject
from app.schemas.note import NoteCreate, NoteRead, NoteUpdate
from app.services.activity_log import log_activity

router = APIRouter(prefix="/notes", tags=["notes"])


def _ensure_subject_exists(db: Session, user_id: str, subject_id: str | None) -> None:
    if subject_id is None:
        return
    subject = db.get(Subject, subject_id)
    if subject is None or subject.user_id != user_id:
        raise HTTPException(status_code=400, detail=f"Subject '{subject_id}' does not exist")


def _get_owned(db: Session, user_id: str, note_id: str) -> Note:
    note = db.get(Note, note_id)
    if note is None or note.user_id != user_id:
        raise HTTPException(status_code=404, detail="Note not found")
    return note


@router.get("", response_model=list[NoteRead])
def list_notes(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    subject_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
) -> list[Note]:
    query = (
        select(Note)
        .where(Note.user_id == current_user.id)
        .order_by(Note.updated_at.desc())
    )

    if subject_id:
        query = query.where(Note.subject_id == subject_id)
    if search:
        like = f"%{search.strip()}%"
        query = query.where(Note.title.ilike(like) | Note.content.ilike(like))

    return list(db.scalars(query).all())


@router.get("/{note_id}", response_model=NoteRead)
def get_note(note_id: str, current_user: CurrentUser, db: Session = Depends(get_db)) -> Note:
    return _get_owned(db, current_user.id, note_id)


@router.post("", response_model=NoteRead, status_code=201)
def create_note(
    payload: NoteCreate, request: Request, current_user: CurrentUser, db: Session = Depends(get_db)
) -> Note:
    _ensure_subject_exists(db, current_user.id, payload.subject_id)
    note = Note(user_id=current_user.id, **payload.model_dump())
    db.add(note)
    db.flush()
    log_activity(
        db,
        request,
        user_id=current_user.id,
        type="note_create",
        label="Note Created",
        text=f"Saved note \"{note.title}\"",
        accent="blue",
    )
    db.commit()
    db.refresh(note)
    return note


@router.patch("/{note_id}", response_model=NoteRead)
def update_note(
    note_id: str,
    payload: NoteUpdate,
    request: Request,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> Note:
    note = _get_owned(db, current_user.id, note_id)

    data = payload.model_dump(exclude_unset=True)
    if "subject_id" in data:
        _ensure_subject_exists(db, current_user.id, data["subject_id"])

    for field, value in data.items():
        setattr(note, field, value)

    db.flush()
    log_activity(
        db,
        request,
        user_id=current_user.id,
        type="note_update",
        label="Note Updated",
        text=f"Edited note \"{note.title}\"",
        accent="blue",
    )
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
def delete_note(
    note_id: str, request: Request, current_user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    note = _get_owned(db, current_user.id, note_id)
    title = note.title
    db.flush()
    log_activity(
        db,
        request,
        user_id=current_user.id,
        type="note_delete",
        label="Note Deleted",
        text=f"Deleted note \"{title}\"",
        accent="red",
    )
    db.delete(note)
    db.commit()