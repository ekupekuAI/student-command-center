"""Application settings loaded from environment variables / .env.

Uses pydantic-settings. Credentials are never hard-coded; the real
connection string lives in `backend/.env` (git-ignored).
"""

import logging
from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ directory (parents: core -> app -> backend)
BASE_DIR = Path(__file__).resolve().parents[2]

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Student Command Center API"
    environment: str = "development"
    api_prefix: str = "/api"

    # Public origin of the app (used for the OpenRouter HTTP-Referer header).
    app_site_url: str = "http://127.0.0.1:5173"

    # SQLAlchemy connection string. Default targets a local dev DB so the
    # app can boot without configuration; the real value is in backend/.env.
    database_url: str = (
        "postgresql+psycopg://postgres:postgres@localhost:5432/student_command_center"
    )

    # Comma-separated allowed CORS origins. The primary env var is
    # CORS_ORIGINS_RAW (pydantic-settings maps the field name directly).
    # CORS_ORIGINS is also accepted as an alias because several deployment
    # platforms and configs document that name; a warning is logged whenever
    # the alias differs so misconfiguration is visible at boot.
    cors_origins_raw: str = "http://localhost:5173,http://127.0.0.1:5173"
    cors_origins_alias: str | None = Field(
        default=None,
        validation_alias="CORS_ORIGINS",
        description="Alias so a bare CORS_ORIGINS env var also controls allowed origins.",
    )

    @property
    def cors_origins(self) -> list[str]:
        raw = self.cors_origins_raw
        alias = self.cors_origins_alias
        default_raw = Settings.model_fields["cors_origins_raw"].default
        if alias and raw == default_raw:
            logger.warning(
                "CORS origins loaded from CORS_ORIGINS alias (%s); "
                "prefer setting CORS_ORIGINS_RAW.",
                alias,
            )
            raw = alias
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    # ── OpenRouter AI (server-side only) ─────────────────────────
    # The API key lives ONLY in backend/.env and is never exposed to the
    # frontend. The base URL / model are configurable so providers or models
    # can be swapped without code changes.
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "openrouter/auto"

    # Request / cost guardrails.
    ai_request_timeout_seconds: float = 45.0
    ai_max_output_tokens: int = 700
    ai_history_limit: int = 12
    ai_context_budget_chars: int = 6000

    # Abuse / cost controls.
    ai_rate_limit_per_minute: int = 20
    auth_rate_limit_per_minute: int = 60

    # ── Authentication (server-only) ──────────────────────────
    # JWT signing secret. The real value lives in backend/.env; the fallback
    # is a clearly-labeled development value that MUST be overridden anywhere
    # except a local dev environment. In `production` the app refuses to start
    # with the placeholder (see main.create_app).
    jwt_secret: str = "dev-only-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7

    # ── Admin bootstrap ───────────────────────────────────────
    # When set, the backend seeds the admin account at startup (idempotent).
    # Credentials live ONLY in the environment / backend/.env — never in code.
    admin_email: str = ""
    admin_password: str = ""
    admin_name: str = "Admin"

    # ── Operational toggles ───────────────────────────────────
    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()