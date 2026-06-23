"""Recommender service (FastAPI): item-item 'more like this', personalised
'for you' (with cold-start fallback), and real-time trending from the Kafka
stream. The item-item model is rebuilt periodically from Mongo event history."""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from . import db
from .cf import WEIGHTS, build_item_similarity, recommend_for_user, similar_to
from .config import settings
from .consumer import Consumer
from .metrics import ITEMS_IN_MODEL, MODEL_REBUILDS, MetricsMiddleware
from .tracing import init_tracing
from .trending import TrendingWindow

log = logging.getLogger("recommender")

trending = TrendingWindow()
_model: dict = {}
_client = httpx.AsyncClient(timeout=5.0)


async def rebuild_model() -> None:
    """Offline-style rebuild of the item-item model from full event history."""
    docs = await db.events().find({}, {"_id": 0}).to_list(length=None)
    interactions = [
        {"userId": d["userId"], "movieId": d["movieId"], "weight": WEIGHTS.get(d["type"], 1)}
        for d in docs
    ]
    global _model
    _model = build_item_similarity(interactions)
    MODEL_REBUILDS.inc()
    ITEMS_IN_MODEL.set(len(_model))
    log.info("model rebuilt: items=%d events=%d", len(_model), len(docs))


async def _rebuild_loop() -> None:
    while True:
        await asyncio.sleep(settings.model_rebuild_seconds)
        try:
            await rebuild_model()
        except Exception as exc:  # noqa: BLE001
            log.warning("rebuild failed: %s", exc)


async def _hydrate(ids: list[int]) -> list[dict]:
    if not ids:
        return []
    try:
        r = await _client.post(f"{settings.catalog_url}/movies/batch", json={"ids": ids})
        r.raise_for_status()
        return r.json().get("items", [])
    except httpx.HTTPError:
        return []


async def _user_interactions(user_id: str) -> dict[int, float]:
    docs = await db.events().find({"userId": user_id}).to_list(length=None)
    out: dict[int, float] = {}
    for d in docs:
        out[d["movieId"]] = out.get(d["movieId"], 0) + WEIGHTS.get(d["type"], 1)
    return out


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    await rebuild_model()
    consumer = Consumer(trending)
    await consumer.start()
    rebuild_task = asyncio.create_task(_rebuild_loop())
    yield
    rebuild_task.cancel()
    await consumer.stop()
    await db.close()


app = FastAPI(title="recommender", version="1.0.0", lifespan=lifespan)
app.add_middleware(MetricsMiddleware)
init_tracing(app)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "recommender"}


@app.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/recommend/similar/{movie_id}")
async def similar(movie_id: int, n: int = Query(10, ge=1, le=50)) -> dict:
    neighbors = similar_to(_model, movie_id, n)
    items = await _hydrate([nid for nid, _ in neighbors])
    return {"source": "item-item-cf", "seed": movie_id, "items": items}


@app.get("/recommend/foryou")
async def for_you(
    n: int = Query(10, ge=1, le=50), x_user_id: str | None = Header(default=None)
) -> dict:
    if not x_user_id:
        raise HTTPException(status_code=400, detail="missing user")
    history = await _user_interactions(x_user_id)
    if not history:
        # Cold-start: fall back to real-time trending.
        items = await _hydrate([mid for mid, _ in trending.top(n)])
        return {"source": "cold-start-trending", "items": items}
    recs = recommend_for_user(_model, history, n)
    items = await _hydrate([rid for rid, _ in recs])
    return {"source": "collaborative-filtering", "items": items}


@app.get("/trending")
async def trending_now(n: int = Query(10, ge=1, le=50)) -> dict:
    items = await _hydrate([mid for mid, _ in trending.top(n)])
    return {"source": "realtime-trending", "items": items}
