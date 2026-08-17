"""Tests for the auth API (register/login/logout/me/profile/password/stats).

All run against the in-memory SQLite DB. The `client` fixture always creates
the fixture user (test@example.com / "correct-horse-battery"), so account
creation and login flows are exercised through the real HTTP API.
"""

from __future__ import annotations


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_register_creates_pending_account(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "   Ada Lovelace  ", "email": "ADA@Example.com", "password": "supersecret1"},
    )
    assert response.status_code == 201
    body = response.json()
    # New accounts are pending and receive NO token until an admin approves.
    assert "access_token" not in body
    assert body["user"]["name"] == "Ada Lovelace"
    assert body["user"]["email"] == "ada@example.com"  # normalized
    assert body["user"]["account_status"] == "pending"
    assert body["message"]
    assert "password" not in body["user"]


def test_register_pending_user_cannot_login(client):
    client.post(
        "/api/auth/register",
        json={"name": "Ada", "email": "ada@example.com", "password": "supersecret1"},
    )
    response = client.post(
        "/api/auth/login",
        json={"email": "ada@example.com", "password": "supersecret1"},
    )
    assert response.status_code == 403
    assert "pending admin approval" in response.json()["detail"]


def test_register_rejected_user_cannot_login(client, db_session):
    from app.core.security import hash_password
    from app.models.user import STATUS_REJECTED, User

    rejected = User(
        name="Nope",
        email="rejected@example.com",
        password_hash=hash_password("supersecret1"),
        account_status=STATUS_REJECTED,
    )
    db_session.add(rejected)
    db_session.commit()

    response = client.post(
        "/api/auth/login",
        json={"email": "rejected@example.com", "password": "supersecret1"},
    )
    assert response.status_code == 403
    assert "rejected by an admin" in response.json()["detail"]


def test_register_duplicate_email_409(client):
    first = client.post(
        "/api/auth/register",
        json={"name": "One", "email": "dup@example.com", "password": "supersecret1"},
    )
    assert first.status_code == 201
    second = client.post(
        "/api/auth/register",
        json={"name": "Two", "email": "DUP@example.com", "password": "othersecret1"},
    )
    assert second.status_code == 409


def test_register_rejects_short_password(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Ada", "email": "ada@example.com", "password": "short"},
    )
    assert response.status_code == 422


def test_register_rejects_invalid_email(client):
    response = client.post(
        "/api/auth/register",
        json={"name": "Ada", "email": "not-an-email", "password": "supersecret1"},
    )
    assert response.status_code == 422


def test_login_success(client, auth_headers):
    response = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "correct-horse-battery"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["access_token"]
    assert body["user"]["email"] == "test@example.com"


def test_login_wrong_password_generic_401(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_login_unknown_email_same_401(client):
    response = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "correct-horse-battery"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_me_requires_auth(client):
    response = client.get("/api/auth/me")
    assert response.status_code == 401
    assert "Authentication required" in response.json()["detail"]


def test_me_rejects_garbage_token(client):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.token"})
    assert response.status_code == 401


def test_me_returns_profile(client, auth_headers):
    response = client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "test@example.com"
    assert body["name"] == "Test User"
    assert "password" not in body


def test_logout_invalidates_token(client, auth_headers):
    response = client.post("/api/auth/logout", headers=auth_headers)
    assert response.status_code == 204
    # The same token must now be rejected.
    assert client.get("/api/auth/me", headers=auth_headers).status_code == 401


def test_update_profile(client, auth_headers):
    response = client.patch(
        "/api/auth/me",
        json={"name": "Renamed User", "avatar_url": "https://example.com/a.png"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Renamed User"
    assert body["avatar_url"] == "https://example.com/a.png"


def test_update_profile_rejects_blank_name(client, auth_headers):
    response = client.patch("/api/auth/me", json={"name": "   "}, headers=auth_headers)
    assert response.status_code == 422


def test_change_password_flow(client):
    login = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "correct-horse-battery"},
    )
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    changed = client.post(
        "/api/auth/change-password",
        json={"current_password": "correct-horse-battery", "new_password": "brand-new-pw-123"},
        headers=headers,
    )
    assert changed.status_code == 204

    # Old password no longer works; new one does.
    old = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "correct-horse-battery"},
    )
    assert old.status_code == 401
    new = client.post(
        "/api/auth/login",
        json={"email": "test@example.com", "password": "brand-new-pw-123"},
    )
    assert new.status_code == 200
    # Existing token stays valid after a password change.
    assert client.get("/api/auth/me", headers=headers).status_code == 200


def test_change_password_wrong_current(client, auth_headers):
    response = client.post(
        "/api/auth/change-password",
        json={"current_password": "nope", "new_password": "brand-new-pw-123"},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Current password is incorrect."


def test_me_stats(client, auth_headers, seeded_subject):
    response = client.get("/api/auth/me/stats", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["subjects_count"] >= 1
    assert body["tasks_total"] >= 4
    assert body["study_total_minutes"] >= 80
    assert body["joined_days"] >= 1