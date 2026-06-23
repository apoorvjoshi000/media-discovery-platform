"""Reverse proxy to downstream services with optional Redis response caching.

Path rewrite: the gateway exposes everything under /api/*; we strip that prefix
so /api/movies -> {catalog}/movies, /api/search/semantic -> {search}/search/...
The authenticated user id is injected as X-User-Id so downstream services can
personalise without re-parsing the JWT."""
from __future__ import annotations

import hashlib

import httpx
from fastapi import Request, Response

from . import clients
from .metrics import CACHE_OPS


def _cache_key(method: str, path: str, query: str, user_id: str, body: bytes) -> str:
    # Body is part of the key so search (a read-style POST whose query lives in
    # the body) caches correctly per distinct query.
    raw = f"{method}:{path}?{query}:{user_id}:".encode() + body
    return "cache:" + hashlib.sha1(raw).hexdigest()


async def forward(
    request: Request,
    target_base: str,
    cache_ttl: int = 0,
    user: dict | None = None,
) -> Response:
    downstream_path = request.url.path[len("/api"):] or "/"
    query = request.url.query
    user_id = user["sub"] if user else "anon"
    body = await request.body()

    rl_remaining = str(getattr(request.state, "rl_remaining", ""))
    base_headers = {"X-RateLimit-Remaining": rl_remaining} if rl_remaining else {}

    # --- cache lookup (GET and read-style POST search) ---
    cacheable = cache_ttl > 0 and request.method in ("GET", "POST")
    key = None
    if cacheable:
        key = _cache_key(request.method, downstream_path, query, user_id, body)
        cached = await clients.redis().get(key)
        if cached is not None:
            CACHE_OPS.labels("hit").inc()
            return Response(
                content=cached,
                media_type="application/json",
                headers={**base_headers, "X-Cache": "HIT"},
            )
        CACHE_OPS.labels("miss").inc()

    # --- forward to downstream ---
    url = f"{target_base}{downstream_path}"
    if query:
        url += f"?{query}"
    fwd_headers = {"X-User-Id": user_id}
    if user:
        fwd_headers["X-User-Role"] = user.get("role", "user")
    if body:
        fwd_headers["Content-Type"] = request.headers.get("content-type", "application/json")

    try:
        resp = await clients.http().request(
            request.method, url, content=body or None, headers=fwd_headers
        )
    except httpx.HTTPError as exc:
        return Response(
            content=f'{{"error":"upstream unavailable","detail":"{exc}"}}',
            status_code=502,
            media_type="application/json",
            headers=base_headers,
        )

    # --- cache store on success ---
    if key is not None and resp.status_code == 200:
        await clients.redis().set(key, resp.content, ex=cache_ttl)

    out_headers = {**base_headers}
    if cacheable:
        out_headers["X-Cache"] = "MISS"
    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type", "application/json"),
        headers=out_headers,
    )
