"""Task CRUD endpoints (scoped to the authenticated user)."""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import CurrentUser
from app.database.session import get_db
from app.models.subject import Subject
from app.models.task import Task
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.services.activity_log import log_activity

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _ensure_subject_exists(db: Session, user_id: str, subject_id: str | None) -> None:
    if subject_id is None:
        return
    subject = db.get(Subject, subject_id)
    if subject is None or subject.user_id != user_id:
        raise HTTPException(status_code=400, detail=f"Subject '{subject_id}' does not exist")


def _subject_name(db: Session, user_id: str, subject_id: str | None) -> str:
    if not subject_id:
        return "General"
    subject = db.get(Subject, subject_id)
    if subject is not None and subject.user_id == user_id:
        return subject.name
    return "General"


def _get_owned(db: Session, user_id: str, task_id: str) -> Task:
    task = db.get(Task, task_id)
    if task is None or task.user_id != user_id:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("", response_model=list[TaskRead])
def list_tasks(
    current_user: CurrentUser,
    db: Session = Depends(get_db),
    status: str | None = Query(default=None, description="todo | in_progress | completed"),
    priority: str | None = Query(default=None, description="high | medium | low"),
    subject_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
) -> list[Task]:
    query = (
        select(Task)
        .where(Task.user_id == current_user.id)
        .order_by(Task.created_at.desc())
    )

    if status:
        query = query.where(Task.status == status)
    if priority:
        query = query.where(Task.priority == priority)
    if subject_id:
        query = query.where(Task.subject_id == subject_id)
    if search:
        like = f"%{search.strip()}%"
        query = query.where(Task.title.ilike(like) | Task.description.ilike(like))

    return list(db.scalars(query).all())


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: str, current_user: CurrentUser, db: Session = Depends(get_db)) -> Task:
    return _get_owned(db, current_user.id, task_id)


@router.post("", response_model=TaskRead, status_code=201)
def create_task(
    payload: TaskCreate, request: Request, current_user: CurrentUser, db: Session = Depends(get_db)
) -> Task:
    _ensure_subject_exists(db, current_user.id, payload.subject_id)
    task = Task(user_id=current_user.id, **payload.model_dump())
    db.add(task)
    db.flush()
    log_activity(
        db,
        request,
        user_id=current_user.id,
        type="task_create",
        label="New Task",
        text=f"Created \"{task.title}\" ({_subject_name(db, current_user.id, task.subject_id)})",
        accent="violet",
    )
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(
    task_id: str,
    payload: TaskUpdate,
    request: Request,
    current_user: CurrentUser,
    db: Session = Depends(get_db),
) -> Task:
    task = _get_owned(db, current_user.id, task_id)

    data = payload.model_dump(exclude_unset=True)
    if "subject_id" in data:
        _ensure_subject_exists(db, current_user.id, data["subject_id"])

    was_completed = task.status == "completed"
    for field, value in data.items():
        setattr(task, field, value)
    now_completed = task.status == "completed"

    db.flush()
    if now_completed and not was_completed:
        log_activity(
            db,
            request,
            user_id=current_user.id,
            type="task_done",
            label="Completed",
            text=f"Completed \"{task.title}\"",
            accent="green",
        )
    else:
        log_activity(
            db,
            request,
            user_id=current_user.id,
            type="task_edit",
            label="Updated",
            text=f"Updated task \"{task.title}\"",
            accent="violet",
        )
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: str, request: Request, current_user: CurrentUser, db: Session = Depends(get_db)
) -> None:
    task = _get_owned(db, current_user.id, task_id)
    title = task.title
    db.flush()
    log_activity(
        db,
        request,
        user_id=current_user.id,
        type="task_delete",
        label="Deleted",
        text=f"Deleted task \"{title}\"",
        accent="red",
    )
    db.delete(task)
    db.commit()