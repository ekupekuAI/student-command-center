"""Health check endpoints.

Liveness and database connectivity probes. The DB probe never leaks internal
connection details — failures are logged server-side and returned as a
generic 503. A CORS diagnostic reports only the origins loaded at runtime
(never credentials, JWT secrets, or API keys).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """Simple liveness check (does not touch the database)."""
    return {"status": "ok"}


@router.get("/health/db")
def database_health(db: Session = Depends(get_db)) -> dict:
    """Verifies the backend can actually communicate with PostgreSQL."""
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:  # pragma: no cover - depends on infra state
        logger.warning("Database health check failed: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable")
    return {"status": "ok", "database": "connected"}


@router.get("/health/cors")
def cors_diagnostics(origin: str | None = None) -> dict:
    """Reports the CORS origins loaded at runtime and whether `origin` is
    allowed. Exposes ONLY CORS configuration — never DATABASE_URL,
    JWT_SECRET, or OPENROUTER_API_KEY."""
    allowed = settings.cors_origins
    return {
        "origins": allowed,
        "origin_allowed": origin in allowed if origin else None,
        "allow_credentials": True,
    }