"""Application settings loaded from environment variables / .env.

Uses pydantic-settings. Credentials are never hard-coded; the real
connection string lives in `backend/.env` (git-ignored).
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/ directory (parents: core -> app -> backend)
BASE_DIR = Path(__file__).resolve().parents[2]


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

    # Comma-separated allowed CORS origins.
    cors_origins_raw: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins_raw.split(",") if origin.strip()]

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

    # ── Operational toggles ───────────────────────────────────
    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()