"""Lightweight in-memory rate limiting (no external dependencies).

Sliding-window limiter used to slow down brute-force attempts on auth
endpoints (per client IP) and runaway usage of the paid AI endpoint (per
user). Windows are pruned lazily so memory stays bounded.

Not a replacement for an edge/proxy rate limiter in high-scale deployments,
but a meaningful first line of defense for this single-app deployment.
"""

from __future__ import annotations

import threading
import time

from fastapi import HTTPException, Request, status

from app.models.user import User


class SlidingWindowRateLimiter:
    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window_seconds: int) -> tuple[bool, float]:
        """Return (allowed, seconds_until_retry). Prunes expired windows."""
        if limit <= 0 or window_seconds <= 0:
            return True, 0.0
        now = time.monotonic()
        cutoff = now - window_seconds
        with self._lock:
            times = [t for t in self._hits.get(key, []) if t > cutoff]
            if len(times) >= limit:
                self._hits[key] = times
                retry_after = max(0.0, window_seconds - (now - times[0]))
                return False, retry_after
            times.append(now)
            self._hits[key] = times
            return True, 0.0


limiter = SlidingWindowRateLimiter()

_RETRY_HEADER = "Retry-After"


def _client_key(request: Request, scope: str) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{scope}:ip:{host}"


def _user_key(request: Request, scope: str, user_id: str) -> str:
    return f"{scope}:user:{user_id}"


def rate_limit_by_ip(scope: str, limit: int, window_seconds: int):
    """Dependency: reject the request when the client IP exceeds the limit."""

    def dependency(request: Request) -> None:
        allowed, retry_after = limiter.allow(
            _client_key(request, scope), limit, window_seconds
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please slow down and try again.",
                headers={_RETRY_HEADER: str(max(1, int(retry_after)))},
            )

    return dependency


def rate_limit_by_user(scope: str, limit: int, window_seconds: int):
    """Dependency: reject the request when the authenticated user exceeds it.

    Resolves the current user via `get_current_user` (imported lazily to avoid
    any import cycle), so a missing/invalid token is rejected as 401 exactly
    as on every other protected endpoint.
    """
    from fastapi import Depends as FastAPIDepends

    from app.core.security import get_current_user

    def dependency(request: Request, user: User = FastAPIDepends(get_current_user)) -> None:
        allowed, retry_after = limiter.allow(
            _user_key(request, scope, user.id), limit, window_seconds
        )
        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please slow down and try again.",
                headers={_RETRY_HEADER: str(max(1, int(retry_after)))},
            )

    return dependency