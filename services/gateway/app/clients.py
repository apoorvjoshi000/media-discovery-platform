"""Shared external clients: Redis (cache + rate-limit buckets), Mongo (users),
and a pooled httpx client for proxying to downstream services."""
from __future__ import annotations

import httpx
import redis.asyncio as aioredis
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection

from .config import settings

_redis: aioredis.Redis | None = None
_mongo: AsyncIOMotorClient | None = None
_http: httpx.AsyncClient | None = None


async def connect() -> None:
    global _redis, _mongo, _http
    _redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    _mongo = AsyncIOMotorClient(settings.mongo_uri, maxPoolSize=20)
    await users().create_index("email", unique=True)
    # Connection pool limits keep the gateway from exhausting downstream sockets
    # under load (the bottleneck k6 surfaced before tuning).
    _http = httpx.AsyncClient(
        timeout=10.0, limits=httpx.Limits(max_connections=200, max_keepalive_connections=50)
    )


def redis() -> aioredis.Redis:
    if _redis is None:
        raise RuntimeError("not connected")
    return _redis


def users() -> AsyncIOMotorCollection:
    if _mongo is None:
        raise RuntimeError("not connected")
    return _mongo.get_default_database()["users"]


def http() -> httpx.AsyncClient:
    if _http is None:
        raise RuntimeError("not connected")
    return _http


async def close() -> None:
    global _redis, _mongo, _http
    if _redis is not None:
        await _redis.aclose()
    if _http is not None:
        await _http.aclose()
    if _mongo is not None:
        _mongo.close()
    _redis = _mongo = _http = None
