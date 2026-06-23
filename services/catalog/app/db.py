"""MongoDB access (async, via Motor) + index setup."""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection

from .config import settings

_client: AsyncIOMotorClient | None = None


async def connect() -> None:
    global _client
    if _client is not None:
        return
    # maxPoolSize fixes the connection-exhaustion bottleneck found under k6 load
    # (see docs/PERF_REPORT.md): without pooling, p99 collapses past ~80 RPS.
    _client = AsyncIOMotorClient(settings.mongo_uri, maxPoolSize=50, minPoolSize=5)
    await _ensure_indexes()


async def _ensure_indexes() -> None:
    col = movies()
    await col.create_index("movieId", unique=True)
    # language_override points at a field we never set, so Mongo does NOT treat
    # our `language` field ("hi", "en", ...) as a per-document text-search
    # language (Hindi "hi" is unsupported and would otherwise error on insert).
    await col.create_index(
        [("title", "text"), ("overview", "text")],
        language_override="searchLanguage",
        default_language="english",
    )
    await col.create_index("genres")
    await col.create_index("year")


def movies() -> AsyncIOMotorCollection:
    if _client is None:
        raise RuntimeError("DB not connected - call connect() first")
    return _client.get_default_database()["movies"]


async def close() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
