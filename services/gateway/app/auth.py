"""Auth routes: signup, login, refresh, logout.

signup creates the account (first user becomes admin so the demo can seed the
catalog). login returns a short-lived access token and sets the refresh token
as an httpOnly cookie. refresh mints a new access token from that cookie."""
from __future__ import annotations

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel, EmailStr, Field

from . import clients
from .config import settings
from .security import (
    hash_password,
    issue_access,
    issue_refresh,
    verify_password,
    verify_refresh,
)

router = APIRouter()


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


@router.post("/signup", status_code=201)
async def signup(body: Credentials) -> dict:
    if await clients.users().find_one({"email": body.email}):
        raise HTTPException(status_code=409, detail="email already registered")
    # First user becomes admin so the demo can seed the catalog; rest are users.
    role = "admin" if await clients.users().count_documents({}) == 0 else "user"
    await clients.users().insert_one(
        {"email": body.email, "passwordHash": hash_password(body.password), "role": role}
    )
    return {"email": body.email, "role": role}


@router.post("/login")
async def login(body: Credentials, response: Response) -> dict:
    user = await clients.users().find_one({"email": body.email})
    if not user or not verify_password(body.password, user["passwordHash"]):
        raise HTTPException(status_code=401, detail="invalid credentials")
    sub, role = body.email, user["role"]
    response.set_cookie(
        "refresh_token",
        issue_refresh(sub, role),
        httponly=True,
        samesite="lax",
        secure=settings.node_env == "production",
        max_age=settings.jwt_refresh_ttl,
    )
    return {
        "accessToken": issue_access(sub, role),
        "email": sub,
        "role": role,
        "expiresIn": settings.jwt_access_ttl,
    }


@router.post("/refresh")
async def refresh(refresh_token: str | None = Cookie(default=None)) -> dict:
    if not refresh_token:
        raise HTTPException(status_code=401, detail="no refresh token")
    decoded = verify_refresh(refresh_token)
    if not decoded:
        raise HTTPException(status_code=401, detail="invalid refresh token")
    return {
        "accessToken": issue_access(decoded["sub"], decoded["role"]),
        "expiresIn": settings.jwt_access_ttl,
    }


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie("refresh_token")
    return {"ok": True}
