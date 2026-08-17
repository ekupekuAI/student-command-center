"""FastAPI application entry point.

Run with:  uvicorn app.main:app --reload   (from the backend/ directory)

Production safeguards applied here:
  - Refuses to start with the placeholder JWT secret when ENVIRONMENT=production.
  - Disables interactive docs (/docs, /redoc) in production.
  - Adds defensive security headers on every response.
  - CORS restricted to the configured origins (env var CORS_ORIGINS_RAW,
    with CORS_ORIGINS accepted as an alias).
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers import activities, ai, auth, health, notes, study, subjects, tasks

_PLACEHOLDER_JWT = "dev-only-secret-change-me"

# Headers applied to every response (safe even for a pure JSON API).
async def _security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault(
        "Referrer-Policy", "strict-origin-when-cross-origin"
    )
    response.headers.setdefault(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    )
    if settings.is_production:
        # Only set HSTS when the site is served over HTTPS.
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    return response


def create_app() -> FastAPI:
    if settings.is_production and settings.jwt_secret == _PLACEHOLDER_JWT:
        raise RuntimeError(
            "Refusing to start in production: JWT_SECRET is still the development "
            "placeholder. Set a strong random JWT_SECRET in backend/.env."
        )

    application = FastAPI(
        title=settings.app_name,
        version="1.0.0",
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None if settings.is_production else "/redoc",
        openapi_url=None if settings.is_production else f"{settings.api_prefix}/openapi.json",
    )

    application.middleware("http")(_security_headers_middleware)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(health.router, prefix=settings.api_prefix)
    application.include_router(auth.router, prefix=settings.api_prefix)
    application.include_router(subjects.router, prefix=settings.api_prefix)
    application.include_router(tasks.router, prefix=settings.api_prefix)
    application.include_router(notes.router, prefix=settings.api_prefix)
    application.include_router(study.router, prefix=settings.api_prefix)
    application.include_router(activities.router, prefix=settings.api_prefix)
    application.include_router(ai.router, prefix=settings.api_prefix)

    @application.get("/")
    def root() -> dict:
        return {
            "message": settings.app_name,
            "environment": settings.environment,
            "docs": "/docs" if not settings.is_production else None,
        }

    return application


app = create_app()