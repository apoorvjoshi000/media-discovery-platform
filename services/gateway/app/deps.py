"""Auth dependencies + the rate-limit dependency, shared by all routes."""
from __future__ import annotations

import time

from fastapi import Header, HTTPException, Request

from .security import verify_access
from .token_bucket import limiter


def _bearer(authorization: str | None) -> str | None:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:]
    return None


async def optional_user(authorization: str | None = Header(default=None)) -> dict | None:
    """Attach the user if a valid access token is present; otherwise None."""
    token = _bearer(authorization)
    if not token:
        return None
    return verify_access(token)


async def require_user(authorization: str | None = Header(default=None)) -> dict:
    user = await optional_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="authentication required")
    return user


async def rate_limit(request: Request, authorization: str | None = Header(default=None)) -> None:
    """Per-identity token bucket: key by user id when authenticated, else client
    IP. Adds X-RateLimit-* headers; raises 429 when the bucket is empty."""
    user = await optional_user(authorization)
    identity = user["sub"] if user else (request.client.host if request.client else "anon")
    allowed, remaining = await limiter.allow(identity, int(time.time() * 1000))
    # Stash headers for the response (set in a middleware/handler).
    request.state.rl_remaining = int(remaining)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="rate limit exceeded",
            headers={"Retry-After": "1", "X-RateLimit-Remaining": "0"},
        )
