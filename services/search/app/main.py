"""Search service — semantic (vector), keyword (delegated to catalog), and
hybrid (RRF) search over the movie corpus."""
from __future__ import annotations

import time

import httpx
from fastapi import FastAPI, Query
from fastapi.responses import Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from pydantic import BaseModel

from .config import settings
from .embeddings import get_embedder
from .qdrant_store import get_store
from .fusion import reciprocal_rank_fusion
from .tracing import init_tracing

app = FastAPI(title="search", version="1.0.0")
init_tracing(app)

# --- metrics ---
SEARCH_REQUESTS = Counter(
    "search_requests_total", "Search requests", ["mode"]
)
SEARCH_LATENCY = Histogram(
    "search_request_duration_seconds",
    "Search latency in seconds",
    ["mode"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.15, 0.25, 0.5, 1, 2.5),
)

_client = httpx.AsyncClient(timeout=5.0)


class SearchQuery(BaseModel):
    query: str
    limit: int = 10
    ef: int | None = None  # HNSW ef_search — exposes the recall/latency knob


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
async def _keyword_ids(query: str, limit: int) -> list[int]:
    """Delegate keyword search to the catalog service's Mongo text index."""
    try:
        r = await _client.get(
            f"{settings.catalog_url}/movies", params={"q": query, "limit": limit}
        )
        r.raise_for_status()
        return [m["movieId"] for m in r.json().get("items", [])]
    except httpx.HTTPError:
        return []


async def _hydrate(ids: list[int]) -> list[dict]:
    """Turn a ranked id list into full movie objects (single batch call)."""
    if not ids:
        return []
    try:
        r = await _client.post(f"{settings.catalog_url}/movies/batch", json={"ids": ids})
        r.raise_for_status()
        return r.json().get("items", [])
    except httpx.HTTPError:
        return []


def _semantic_ids(query: str, limit: int, ef: int | None) -> list[tuple[int, float]]:
    vec = get_embedder().encode_one(query)
    return get_store().search(vec, limit=limit, ef=ef)


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "search"}


@app.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/stats")
async def stats() -> dict:
    try:
        return {"indexed_vectors": get_store().count()}
    except Exception as exc:  # noqa: BLE001
        return {"indexed_vectors": None, "error": str(exc)}


@app.post("/search/semantic")
async def semantic(body: SearchQuery) -> dict:
    start = time.perf_counter()
    hits = _semantic_ids(body.query, body.limit, body.ef)
    items = await _hydrate([i for i, _ in hits])
    score_by_id = dict(hits)
    for it in items:
        it["score"] = score_by_id.get(it["movieId"])
    SEARCH_REQUESTS.labels("semantic").inc()
    SEARCH_LATENCY.labels("semantic").observe(time.perf_counter() - start)
    return {"mode": "semantic", "items": items}


@app.post("/search/keyword")
async def keyword(body: SearchQuery) -> dict:
    start = time.perf_counter()
    ids = await _keyword_ids(body.query, body.limit)
    items = await _hydrate(ids)
    SEARCH_REQUESTS.labels("keyword").inc()
    SEARCH_LATENCY.labels("keyword").observe(time.perf_counter() - start)
    return {"mode": "keyword", "items": items}


@app.post("/search/hybrid")
async def hybrid(body: SearchQuery) -> dict:
    """Run keyword + semantic, fuse with RRF, hydrate the fused ranking."""
    start = time.perf_counter()
    # Pull a wider candidate set than `limit` from each arm so fusion has room.
    pool = max(body.limit * 3, 20)
    semantic_hits = _semantic_ids(body.query, pool, body.ef)
    keyword_ids = await _keyword_ids(body.query, pool)
    fused = reciprocal_rank_fusion([[i for i, _ in semantic_hits], keyword_ids])
    top_ids = [doc_id for doc_id, _ in fused[: body.limit]]
    items = await _hydrate(top_ids)
    fused_score = dict(fused)
    for it in items:
        it["score"] = fused_score.get(it["movieId"])
    SEARCH_REQUESTS.labels("hybrid").inc()
    SEARCH_LATENCY.labels("hybrid").observe(time.perf_counter() - start)
    return {"mode": "hybrid", "items": items}
