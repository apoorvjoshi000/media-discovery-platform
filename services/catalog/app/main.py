"""Catalog service (FastAPI) - CRUD over the movie corpus + browse/filter +
the interaction endpoint that fans events out to Kafka."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
from pydantic import BaseModel, Field

from . import db, events
from .config import settings
from .metrics import MetricsMiddleware
from .tracing import init_tracing


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    await events.init_producer()
    yield
    await events.close_producer()
    await db.close()


app = FastAPI(title="catalog", version="1.0.0", lifespan=lifespan)
app.add_middleware(MetricsMiddleware)
init_tracing(app)

PROJECTION = {"_id": 0}


class Movie(BaseModel):
    movieId: int
    title: str
    year: int
    genres: list[str]
    language: str
    overview: str
    posterPath: str | None = None
    voteAverage: float | None = None
    runtime: int | None = None


class BatchBody(BaseModel):
    ids: list[int] = Field(max_length=200)


class Interaction(BaseModel):
    type: str = Field(pattern="^(view|click|play)$")
    movieId: int


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "catalog"}


@app.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/movies")
async def list_movies(
    genre: str | None = None,
    year: int | None = None,
    language: str | None = None,
    q: str | None = None,
    limit: int = Query(20, ge=1, le=100),
    skip: int = Query(0, ge=0),
) -> dict:
    filt: dict = {}
    if genre:
        filt["genres"] = genre
    if year:
        filt["year"] = year
    if language:
        filt["language"] = language
    if q:
        filt["$text"] = {"$search": q}

    projection = dict(PROJECTION)
    if q:
        # Surface the text relevance score and sort by it for keyword search.
        projection["score"] = {"$meta": "textScore"}
        sort = [("score", {"$meta": "textScore"})]
    else:
        sort = [("voteAverage", -1)]

    cursor = db.movies().find(filt, projection).sort(sort).skip(skip).limit(limit)
    items = await cursor.to_list(length=limit)
    total = await db.movies().count_documents(filt)
    return {"total": total, "limit": limit, "skip": skip, "items": items}


@app.get("/movies/{movie_id}")
async def get_movie(movie_id: int) -> dict:
    movie = await db.movies().find_one({"movieId": movie_id}, PROJECTION)
    if not movie:
        raise HTTPException(status_code=404, detail="not found")
    return movie


@app.post("/movies/batch")
async def batch(body: BatchBody) -> dict:
    """Fetch many by id, preserving the caller's ranking order. Used by search
    and recommender to hydrate ranked id lists in one round-trip."""
    docs = await db.movies().find({"movieId": {"$in": body.ids}}, PROJECTION).to_list(length=len(body.ids))
    by_id = {d["movieId"]: d for d in docs}
    return {"items": [by_id[i] for i in body.ids if i in by_id]}


@app.put("/movies/{movie_id}")
async def upsert(movie_id: int, movie: Movie) -> dict:
    doc = movie.model_dump()
    await db.movies().update_one({"movieId": movie.movieId}, {"$set": doc}, upsert=True)
    return doc


@app.post("/interactions", status_code=202)
async def interaction(body: Interaction, x_user_id: str = Header(...)) -> dict:
    # Identity comes from the X-User-Id header injected by the gateway (the auth
    # boundary), not from the body, so clients never self-assert their user id.
    delivered = await events.emit(
        {"type": body.type, "userId": x_user_id, "movieId": body.movieId, "ts": _now_ms()}
    )
    # 202: accepted even if Kafka is down (event dropped) - never block the user.
    return {"accepted": True, "delivered": delivered}


def _now_ms() -> int:
    import time

    return int(time.time() * 1000)
