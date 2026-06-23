"""JWT issue/verify + password hashing.

Access token: short-lived (15 min), sent as a Bearer header, verified on every
request. Refresh token: long-lived (7 days), stored in an httpOnly + SameSite
cookie to mitigate XSS token theft, exchanged at /api/auth/refresh."""
from __future__ import annotations

import time

import bcrypt
import jwt

from .config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def issue_access(sub: str, role: str) -> str:
    now = int(time.time())
    payload = {"sub": sub, "role": role, "iat": now, "exp": now + settings.jwt_access_ttl}
    return jwt.encode(payload, settings.jwt_access_secret, algorithm="HS256")


def issue_refresh(sub: str, role: str) -> str:
    now = int(time.time())
    payload = {"sub": sub, "role": role, "iat": now, "exp": now + settings.jwt_refresh_ttl}
    return jwt.encode(payload, settings.jwt_refresh_secret, algorithm="HS256")


def verify_access(token: str) -> dict | None:
    return _verify(token, settings.jwt_access_secret)


def verify_refresh(token: str) -> dict | None:
    return _verify(token, settings.jwt_refresh_secret)


def _verify(token: str, secret: str) -> dict | None:
    try:
        return jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
