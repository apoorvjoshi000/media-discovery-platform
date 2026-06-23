"""Mongo persistence for interaction events. Persisting the stream lets the
item-item model survive restarts and lets the offline rebuild read history."""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection

from .config import settings

_client: AsyncIOMotorClient | None = None


async def connect() -> None:
    global _client
    if _client is not None:
        return
    _client = AsyncIOMotorClient(settings.mongo_uri, maxPoolSize=20)
    await events().create_index("userId")
    await events().create_index("movieId")


def events() -> AsyncIOMotorCollection:
    if _client is None:
        raise RuntimeError("DB not connected")
    return _client.get_default_database()["events"]


async def close() -> None:
    global _client
    if _client is not None:
        _client.close()
        _client = None
