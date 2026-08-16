"""Tests for the production-readiness hardening.

Covers the sliding-window rate limiter, the API-level 429 behaviour on the
auth (per-IP) and AI (per-user) endpoints, security headers on responses,
and the production-only safeguards (placeholder JWT guard, docs disabled).

The limiter is swapped for a fresh instance and pre-seeded instead of making
hundreds of real (bcrypt) login attempts, keeping the suite fast and free of
cross-test interference.
"""

from __future__ import annotations

import time

import pytest

import app.core.rate_limit as rate_limit


@pytest.fixture(autouse=True)
def _isolate_limiter(monkeypatch):
    """Every test gets a pristine limiter so budgets never leak between tests."""
    monkeypatch.setattr(rate_limit, "limiter", rate_limit.SlidingWindowRateLimiter())


# --------------------------------------------------------------------------- #
# SlidingWindowRateLimiter unit tests
# --------------------------------------------------------------------------- #


def test_limiter_allows_up_to_limit_then_rejects():
    fresh = rate_limit.SlidingWindowRateLimiter()
    for _ in range(3):
        assert fresh.allow("key", 3, 60) == (True, 0.0)
    allowed, retry_after = fresh.allow("key", 3, 60)
    assert allowed is False
    assert retry_after > 0


def test_limiter_scopes_are_independent():
    fresh = rate_limit.SlidingWindowRateLimiter()
    for _ in range(3):
        fresh.allow("a", 3, 60)
    assert fresh.allow("b", 3, 60) == (True, 0.0)


def test_limiter_prunes_expired_hits():
    fresh = rate_limit.SlidingWindowRateLimiter()
    fresh._hits["key"] = [time.monotonic() - 70, time.monotonic() - 65]
    assert fresh.allow("key", 3, 60) == (True, 0.0)


def test_limiter_disabled_when_limit_zero():
    fresh = rate_limit.SlidingWindowRateLimiter()
    assert fresh.allow("key", 0, 60) == (True, 0.0)


# --------------------------------------------------------------------------- #
# API-level 429 behaviour
# --------------------------------------------------------------------------- #


def _prefill(monkeypatch, key: str, count: int) -> None:
    fresh = rate_limit.SlidingWindowRateLimiter()
    fresh._hits[key] = [time.monotonic() - 1] * count
    monkeypatch.setattr(rate_limit, "limiter", fresh)


def test_auth_login_rate_limited_per_ip(client, monkeypatch):
    _prefill(monkeypatch, "auth:ip:testclient", 60)
    response = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "wrong-password"},
    )
    assert response.status_code == 429
    assert response.json()["detail"] == "Too many requests. Please slow down and try again."
    assert "retry-after" in response.headers


def test_ai_chat_rate_limited_per_user(client, auth_headers, user, monkeypatch):
    _prefill(monkeypatch, f"ai:user:{user.id}", 20)
    response = client.post(
        "/api/ai/chat",
        json={"message": "What's due today?"},
        headers=auth_headers,
    )
    assert response.status_code == 429


def test_ai_chat_unauthenticated_still_401(client, monkeypatch):
    _prefill(monkeypatch, "ai:user:none", 20)
    response = client.post("/api/ai/chat", json={"message": "hi"})
    assert response.status_code == 401


# --------------------------------------------------------------------------- #
# Security headers
# --------------------------------------------------------------------------- #


def test_security_headers_present_on_responses(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "geolocation=()" in response.headers["permissions-policy"]
    # HSTS is only emitted in production (over HTTPS), never in development.
    assert "strict-transport-security" not in response.headers


def test_security_headers_present_on_errors(client):
    response = client.get("/api/subjects")
    assert response.status_code == 401
    assert response.headers["x-content-type-options"] == "nosniff"


# --------------------------------------------------------------------------- #
# Production-only safeguards
# --------------------------------------------------------------------------- #


def test_production_refuses_placeholder_jwt(monkeypatch):
    from app.core.config import settings
    from app.main import create_app

    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "jwt_secret", "dev-only-secret-change-me")
    with pytest.raises(RuntimeError):
        create_app()


def test_production_disables_docs_and_openapi(monkeypatch):
    from app.core.config import settings
    from app.main import create_app

    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "jwt_secret", "a-strong-random-secret")
    production_app = create_app()
    assert production_app.docs_url is None
    assert production_app.redoc_url is None
    assert production_app.openapi_url is None