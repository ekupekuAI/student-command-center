"""CORS configuration and preflight behavior tests.

These verify the exact env-var name used by config.py, the alias fallback,
CORSMiddleware behavior for allowed/disallowed origins, that middleware order
does not block OPTIONS preflight, and that the CORS diagnostic never leaks
secrets.
"""

from __future__ import annotations

from app.core.config import Settings

ALLOWED_DEV_ORIGIN = "http://localhost:5173"
DISALLOWED_ORIGIN = "https://evil.example"


# ── env var name used by config.py ────────────────────────────────────────

def test_cors_origins_reads_cors_origins_raw(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS_RAW", raising=False)
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    s = Settings(
        _env_file=None,
        cors_origins_raw=f"{ALLOWED_DEV_ORIGIN}, http://127.0.0.1:5173 ",
    )
    assert s.cors_origins == [ALLOWED_DEV_ORIGIN, "http://127.0.0.1:5173"]


def test_cors_origins_accepts_cors_origins_alias(monkeypatch):
    """A bare CORS_ORIGINS env var (common on hosting platforms) must win when
    CORS_ORIGINS_RAW is not explicitly set."""
    monkeypatch.delenv("CORS_ORIGINS_RAW", raising=False)
    monkeypatch.setenv(
        "CORS_ORIGINS",
        f"https://student-command-center-chi.vercel.app,{ALLOWED_DEV_ORIGIN}",
    )
    s = Settings(_env_file=None)
    assert s.cors_origins == [
        "https://student-command-center-chi.vercel.app",
        ALLOWED_DEV_ORIGIN,
    ]


def test_cors_origins_prefers_cors_origins_raw_over_alias(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS_RAW", "https://raw.example")
    monkeypatch.setenv("CORS_ORIGINS", "https://alias.example")
    s = Settings(_env_file=None)
    assert s.cors_origins == ["https://raw.example"]


# ── CORSMiddleware behavior through the full app ──────────────────────────

def test_preflight_allowed_origin(client):
    response = client.options(
        "/api/health",
        headers={
            "Origin": ALLOWED_DEV_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_DEV_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"


def test_preflight_disallowed_origin_is_rejected(client):
    response = client.options(
        "/api/health",
        headers={
            "Origin": DISALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 400
    assert response.headers.get("access-control-allow-origin") != DISALLOWED_ORIGIN


def test_simple_request_allowed_origin_gets_acao(client):
    response = client.get("/api/health", headers={"Origin": ALLOWED_DEV_ORIGIN})
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_DEV_ORIGIN
    assert response.headers["x-content-type-options"] == "nosniff"


def test_simple_request_disallowed_origin_gets_no_acao(client):
    response = client.get("/api/health", headers={"Origin": DISALLOWED_ORIGIN})
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_cors_handles_options_despite_security_headers_middleware(client):
    """Middleware order must not prevent CORSMiddleware from answering OPTIONS
    (CORSMiddleware is the outer-most middleware and answers preflight before
    the security-headers middleware runs, which is correct browser behavior)."""
    response = client.options(
        "/api/health",
        headers={
            "Origin": ALLOWED_DEV_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == ALLOWED_DEV_ORIGIN


# ── CORS diagnostic endpoint ──────────────────────────────────────────────

def test_cors_diagnostic_reports_loaded_origins(client):
    response = client.get(
        "/api/health/cors", params={"origin": ALLOWED_DEV_ORIGIN}
    )
    assert response.status_code == 200
    body = response.json()
    assert ALLOWED_DEV_ORIGIN in body["origins"]
    assert body["origin_allowed"] is True
    assert body["allow_credentials"] is True


def test_cors_diagnostic_flags_unknown_origin(client):
    response = client.get(
        "/api/health/cors",
        params={"origin": "https://student-command-center-chi.vercel.app"},
    )
    body = response.json()
    assert body["origin_allowed"] is False


def test_cors_diagnostic_never_leaks_secrets(client):
    response = client.get("/api/health/cors")
    assert response.status_code == 200
    payload = str(response.json()).lower()
    for secret_fragment in (
        "postgres",
        "jwt_secret",
        "database_url",
        "openrouter_api_key",
        "sk-or-v1",
        "password",
    ):
        assert secret_fragment not in payload