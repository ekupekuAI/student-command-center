"""Cross-user isolation tests.

Every user-owned endpoint must refuse to show, edit, or delete another user's
rows (404, never a data leak), and the AI context builder must only ever see
the requesting user's data. Uses two users: the fixture `user`/`auth_headers`
(owner) and a second user created inside each test.
"""

from __future__ import annotations

from app.core.security import hash_password
from app.models.user import User
from app.services.auth_service import issue_token
from app.services.context_service import build_student_context


def _second_user(db_session) -> tuple[User, dict]:
    other = User(
        name="Other User",
        email="other@example.com",
        password_hash=hash_password("other-secret-pass"),
        account_status="approved",
    )
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)
    return other, {"Authorization": f"Bearer {issue_token(other)}"}


def test_owner_can_read_own_subject(client, auth_headers, seeded_subject):
    response = client.get(f"/api/subjects/{seeded_subject.id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["code"] == "CS301"


def test_other_user_cannot_read_subject(client, db_session, auth_headers, seeded_subject):
    _, other_headers = _second_user(db_session)
    response = client.get(f"/api/subjects/{seeded_subject.id}", headers=other_headers)
    assert response.status_code == 404


def test_other_user_cannot_update_subject(client, db_session, auth_headers, seeded_subject):
    _, other_headers = _second_user(db_session)
    response = client.patch(
        f"/api/subjects/{seeded_subject.id}", json={"name": "Hijacked"}, headers=other_headers
    )
    assert response.status_code == 404


def test_other_user_cannot_delete_subject(client, db_session, auth_headers, seeded_subject):
    _, other_headers = _second_user(db_session)
    response = client.delete(f"/api/subjects/{seeded_subject.id}", headers=other_headers)
    assert response.status_code == 404
    # Owner can still read it.
    assert client.get(f"/api/subjects/{seeded_subject.id}", headers=auth_headers).status_code == 200


def test_other_user_list_does_not_include_owner_subject(client, db_session, auth_headers, seeded_subject):
    _, other_headers = _second_user(db_session)
    response = client.get("/api/subjects", headers=other_headers)
    assert response.status_code == 200
    ids = [s["id"] for s in response.json()]
    assert seeded_subject.id not in ids


def test_other_user_cannot_read_task(client, db_session, auth_headers, seeded_subject):
    from app.models.task import Task
    from sqlalchemy import select

    task = db_session.scalar(select(Task).where(Task.subject_id == seeded_subject.id))
    _, other_headers = _second_user(db_session)
    response = client.get(f"/api/tasks/{task.id}", headers=other_headers)
    assert response.status_code == 404


def test_other_user_cannot_update_task(client, db_session, auth_headers, seeded_subject):
    from app.models.task import Task
    from sqlalchemy import select

    task = db_session.scalar(select(Task).where(Task.subject_id == seeded_subject.id))
    _, other_headers = _second_user(db_session)
    response = client.patch(f"/api/tasks/{task.id}", json={"status": "completed"}, headers=other_headers)
    assert response.status_code == 404


def test_task_linked_to_other_subject_rejected(client, db_session, auth_headers, seeded_subject):
    """Creating a task whose subject belongs to another user is a 400."""
    _, other_headers = _second_user(db_session)
    response = client.post(
        "/api/tasks",
        json={"title": "Sneaky", "subject_id": seeded_subject.id},
        headers=other_headers,
    )
    assert response.status_code == 400


def test_other_user_cannot_read_note(client, db_session, auth_headers, seeded_subject):
    from app.models.note import Note
    from sqlalchemy import select

    note = db_session.scalar(select(Note).where(Note.subject_id == seeded_subject.id))
    _, other_headers = _second_user(db_session)
    response = client.get(f"/api/notes/{note.id}", headers=other_headers)
    assert response.status_code == 404


def test_other_user_cannot_read_study_session(client, db_session, auth_headers, seeded_subject):
    from app.models.study_session import StudySession
    from sqlalchemy import select

    session = db_session.scalar(select(StudySession).where(StudySession.subject_id == seeded_subject.id))
    _, other_headers = _second_user(db_session)
    response = client.get(f"/api/study-sessions/{session.id}", headers=other_headers)
    assert response.status_code == 404


def test_other_user_activity_stream_is_empty(client, db_session, auth_headers, seeded_subject):
    _, other_headers = _second_user(db_session)
    response = client.get("/api/activities", headers=other_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_other_user_cannot_read_owner_activity(client, db_session, auth_headers, seeded_subject):
    from app.models.activity import Activity
    from sqlalchemy import select

    # Owner creates a subject through the API so an activity row is logged.
    created = client.post(
        "/api/subjects",
        json={"code": "MAT101", "name": "Calculus", "instructor": "Dr. P", "credits": 4,
              "semester": "Fall 2026", "color": "blue", "accent": "blue"},
        headers=auth_headers,
    )
    assert created.status_code == 201
    activity = db_session.scalar(select(Activity).order_by(Activity.timestamp.desc()))
    _, other_headers = _second_user(db_session)
    response = client.get(f"/api/activities?limit=200", headers=other_headers)
    assert response.status_code == 200
    assert all(a["id"] != activity.id for a in response.json())


def test_ai_context_scoped_to_user(db_session, user, seeded_subject):
    other = User(
        name="Other",
        email="other@example.com",
        password_hash=hash_password("other-secret-pass"),
    )
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)

    owner_context = build_student_context(db_session, user.id, "What should I study today?")
    other_context = build_student_context(db_session, other.id, "What should I study today?")

    owner_titles = [t["title"] for t in owner_context.data.get("tasks", [])]
    assert any("AVL" in t for t in owner_titles)
    # Other user sees an empty/owner-less context.
    other_titles = [t["title"] for t in other_context.data.get("tasks", [])]
    assert all("AVL" not in t for t in other_titles)
    assert other_context.data["tasks"] == []