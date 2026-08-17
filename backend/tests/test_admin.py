"""Tests for the admin & master-admin approval/manage flow.

Covers the pending→approved/rejected lifecycle, login gating, admin CRUD on
users, role-based guards, and immediate token revocation on reject.
"""

from __future__ import annotations

import pytest

from app.core.security import hash_password


def _make_user(db_session, *, email, role="user", status="approved", name="Someone"):
    from app.models.user import User

    user = User(
        name=name,
        email=email,
        password_hash=hash_password("supersecret1"),
        role=role,
        account_status=status,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _login(client, email, password="supersecret1"):
    response = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _register(client, email, name="New User"):
    return client.post(
        "/api/auth/register",
        json={"name": name, "email": email, "password": "supersecret1"},
    )


# ── Approval lifecycle ──────────────────────────────────────────


def test_register_user_appears_pending_and_cannot_login(client, db_session):
    admin = _make_user(db_session, email="boss@example.com", role="admin")
    headers = _login(client, admin.email)

    created = _register(client, "student@example.com")
    assert created.status_code == 201
    assert created.json()["user"]["account_status"] == "pending"

    listing = client.get("/api/admin/users?status=pending", headers=headers)
    assert listing.status_code == 200
    emails = [u["email"] for u in listing.json()]
    assert "student@example.com" in emails

    # Pending user still cannot log in.
    blocked = client.post(
        "/api/auth/login",
        json={"email": "student@example.com", "password": "supersecret1"},
    )
    assert blocked.status_code == 403


def test_admin_approves_pending_user_who_can_then_login(client, db_session):
    admin = _make_user(db_session, email="boss@example.com", role="admin")
    headers = _login(client, admin.email)
    created = _register(client, "student@example.com")
    user_id = created.json()["user"]["id"]

    approved = client.post(f"/api/admin/users/{user_id}/approve", headers=headers)
    assert approved.status_code == 200
    assert approved.json()["account_status"] == "approved"

    ok = client.post(
        "/api/auth/login",
        json={"email": "student@example.com", "password": "supersecret1"},
    )
    assert ok.status_code == 200
    assert ok.json()["access_token"]


def test_admin_rejects_user_and_revokes_tokens(client, db_session):
    admin = _make_user(db_session, email="boss@example.com", role="admin")
    admin_headers = _login(client, admin.email)

    user = _make_user(db_session, email="worker@example.com", status="approved")
    user_headers = _login(client, user.email)
    assert client.get("/api/auth/me", headers=user_headers).status_code == 200

    rejected = client.post(f"/api/admin/users/{user.id}/reject", headers=admin_headers)
    assert rejected.status_code == 200
    assert rejected.json()["account_status"] == "rejected"

    # Existing token is now useless and login is blocked.
    assert client.get("/api/auth/me", headers=user_headers).status_code == 401
    assert client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "supersecret1"},
    ).status_code == 403


def test_admin_resets_password_and_deletes_user(client, db_session):
    admin = _make_user(db_session, email="boss@example.com", role="admin")
    admin_headers = _login(client, admin.email)
    target = _make_user(db_session, email="target@example.com", status="approved")

    reset = client.post(
        f"/api/admin/users/{target.id}/reset-password",
        json={"new_password": "forced-new-pw-99"},
        headers=admin_headers,
    )
    assert reset.status_code == 204
    # Old password no longer works.
    assert client.post(
        "/api/auth/login",
        json={"email": target.email, "password": "supersecret1"},
    ).status_code == 401
    assert client.post(
        "/api/auth/login",
        json={"email": target.email, "password": "forced-new-pw-99"},
    ).status_code == 200

    deleted = client.delete(f"/api/admin/users/{target.id}", headers=admin_headers)
    assert deleted.status_code == 204
    assert client.get("/api/admin/users", headers=admin_headers).status_code == 200
    emails = [u["email"] for u in client.get("/api/admin/users", headers=admin_headers).json()]
    assert target.email not in emails


# ── Role guards ─────────────────────────────────────────────────


def test_regular_user_cannot_access_admin_api(client, user, auth_headers):
    response = client.get("/api/admin/users", headers=auth_headers)
    assert response.status_code == 403


def test_unauthenticated_admin_api_returns_401(client):
    assert client.get("/api/admin/users").status_code == 401


def test_admin_cannot_manage_another_admin(client, db_session):
    admin_a = _make_user(db_session, email="a@example.com", role="admin")
    admin_b = _make_user(db_session, email="b@example.com", role="admin")
    headers = _login(client, admin_a.email)

    blocked = client.delete(f"/api/admin/users/{admin_b.id}", headers=headers)
    assert blocked.status_code == 403
    blocked_role = client.patch(
        f"/api/admin/users/{admin_b.id}",
        json={"account_status": "rejected"},
        headers=headers,
    )
    assert blocked_role.status_code == 403


def test_master_admin_can_promote_and_demote(client, db_session):
    master = _make_user(db_session, email="master@example.com", role="master_admin")
    headers = _login(client, master.email)
    regular = _make_user(db_session, email="regular@example.com", status="approved")

    promoted = client.post(f"/api/admin/users/{regular.id}/role?role=admin", headers=headers)
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "admin"

    demoted = client.post(f"/api/admin/users/{regular.id}/role?role=user", headers=headers)
    assert demoted.status_code == 200
    assert demoted.json()["role"] == "user"


def test_regular_admin_cannot_promote(client, db_session):
    admin = _make_user(db_session, email="admin@example.com", role="admin")
    headers = _login(client, admin.email)
    regular = _make_user(db_session, email="regular@example.com", status="approved")

    response = client.post(f"/api/admin/users/{regular.id}/role?role=admin", headers=headers)
    assert response.status_code == 403


def test_master_admin_cannot_delete_own_account(client, db_session):
    master = _make_user(db_session, email="master@example.com", role="master_admin")
    headers = _login(client, master.email)

    response = client.delete(f"/api/admin/users/{master.id}", headers=headers)
    assert response.status_code == 400


def test_master_admin_cannot_demote_self(client, db_session):
    master = _make_user(db_session, email="master@example.com", role="master_admin")
    headers = _login(client, master.email)

    response = client.post(f"/api/admin/users/{master.id}/role?role=user", headers=headers)
    assert response.status_code == 400


def test_admin_update_duplicate_email_409(client, db_session):
    admin = _make_user(db_session, email="boss@example.com", role="admin")
    headers = _login(client, admin.email)
    one = _make_user(db_session, email="one@example.com", status="approved")
    _make_user(db_session, email="two@example.com", status="approved")

    response = client.patch(
        f"/api/admin/users/{one.id}",
        json={"email": "two@example.com"},
        headers=headers,
    )
    assert response.status_code == 409


# ── Master admin seeding ────────────────────────────────────────


def test_ensure_admin_creates_master_admin(db_session, monkeypatch):
    from app.core.config import settings
    from app.services.auth_service import ensure_admin

    monkeypatch.setattr(settings, "admin_email", "master@example.com")
    monkeypatch.setattr(settings, "admin_password", "super-secret-1")
    monkeypatch.setattr(settings, "admin_name", "Big Boss")

    user = ensure_admin(db_session)
    assert user.role == "master_admin"
    assert user.account_status == "approved"
    assert user.email == "master@example.com"

    # Idempotent: a second call does not duplicate the account.
    again = ensure_admin(db_session)
    assert again.id == user.id


def test_ensure_admin_noop_without_config(db_session, monkeypatch):
    from app.core.config import settings
    from app.services.auth_service import ensure_admin

    monkeypatch.setattr(settings, "admin_email", "")
    monkeypatch.setattr(settings, "admin_password", "")
    assert ensure_admin(db_session) is None


# ── Login tracking & admin overview ─────────────────────────────


def test_login_count_increments(client, db_session):
    user = _make_user(db_session, email="counter@example.com", status="approved")
    assert user.login_count == 0
    assert user.last_login_at is None

    _login(client, user.email)
    _login(client, user.email)
    db_session.refresh(user)
    assert user.login_count == 2
    assert user.last_login_at is not None


def test_login_count_does_not_increment_for_failed_login(client, db_session):
    user = _make_user(db_session, email="counter@example.com", status="approved")
    response = client.post(
        "/api/auth/login",
        json={"email": user.email, "password": "wrong-password"},
    )
    assert response.status_code == 401
    db_session.refresh(user)
    assert user.login_count == 0


def test_admin_overview_reports_logins_and_counts(client, db_session):
    admin = _make_user(db_session, email="boss@example.com", role="admin")
    headers = _login(client, admin.email)
    _make_user(db_session, email="pending@example.com", status="pending")
    _make_user(db_session, email="approved@example.com", status="approved")
    _make_user(db_session, email="rejected@example.com", status="rejected")

    overview = client.get("/api/admin/overview", headers=headers)
    assert overview.status_code == 200
    data = overview.json()
    assert data["login_count"] == 1
    assert data["last_login_at"] is not None
    # fixture user (test@example.com, approved) + admin + 3 status users
    assert data["counts"]["total"] == 5
    assert data["counts"]["pending"] == 1
    assert data["counts"]["approved"] == 3
    assert data["counts"]["rejected"] == 1
    assert data["counts"]["admins"] == 1


def test_admin_actions_are_logged_in_overview(client, db_session):
    admin = _make_user(db_session, email="boss@example.com", role="admin")
    headers = _login(client, admin.email)
    created = _register(client, "student@example.com")
    user_id = created.json()["user"]["id"]
    client.post(f"/api/admin/users/{user_id}/approve", headers=headers)
    client.post(f"/api/admin/users/{user_id}/reject", headers=headers)

    overview = client.get("/api/admin/overview", headers=headers)
    data = overview.json()
    actions = [a["action"] for a in data["activity"]]
    assert "approve" in actions
    assert "reject" in actions
    assert any("student@example.com" in a["detail"] for a in data["activity"])


def test_admin_overview_forbidden_for_regular_user(client, auth_headers):
    assert client.get("/api/admin/overview", headers=auth_headers).status_code == 403