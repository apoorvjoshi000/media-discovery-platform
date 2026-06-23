"""API gateway (FastAPI): JWT auth, Redis token-bucket rate limiting, response
caching, and routing to the catalog / search / recommender services.

Public surface is everything under /api/*. Auth and rate limiting are applied
as dependencies; the proxy strips the /api prefix before forwarding."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from . import clients
from .auth import router as auth_router
from .config import settings
from .deps import optional_user, rate_limit, require_user
from .metrics import MetricsMiddleware
from .proxy import forward
from .tracing import init_tracing


@asynccontextmanager
async def lifespan(app: FastAPI):
    await clients.connect()
    yield
    await clients.close()


app = FastAPI(title="gateway", version="1.0.0", lifespan=lifespan)
app.add_middleware(MetricsMiddleware)
# CORS so the browser client at :3000 can call the gateway at :8080.
# allow_credentials=True is needed for the refresh-token cookie, which rules out
# a wildcard origin, so we list the web origins explicitly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Cache", "X-RateLimit-Remaining"],
)
init_tracing(app)

CATALOG = settings.catalog_url
SEARCH = settings.search_url
RECOMMENDER = settings.recommender_url


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "gateway"}


@app.get("/metrics")
async def metrics() -> Response:
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# --- auth (rate limited) ---
app.include_router(
    auth_router, prefix="/api/auth", dependencies=[Depends(rate_limit)]
)


# --- catalog ---
@app.get("/api/movies", dependencies=[Depends(rate_limit)])
async def movies(request: Request, user=Depends(optional_user)) -> Response:
    return await forward(request, CATALOG, cache_ttl=30, user=user)


@app.get("/api/movies/{movie_id}", dependencies=[Depends(rate_limit)])
async def movie(request: Request, movie_id: int, user=Depends(optional_user)) -> Response:
    return await forward(request, CATALOG, cache_ttl=60, user=user)


# --- search ---
@app.post("/api/search/{mode}", dependencies=[Depends(rate_limit)])
async def search(request: Request, mode: str, user=Depends(optional_user)) -> Response:
    return await forward(request, SEARCH, cache_ttl=60, user=user)


# --- recommender ---
@app.get("/api/recommend/similar/{movie_id}", dependencies=[Depends(rate_limit)])
async def similar(request: Request, movie_id: int, user=Depends(optional_user)) -> Response:
    return await forward(request, RECOMMENDER, user=user)


@app.get("/api/recommend/foryou", dependencies=[Depends(rate_limit)])
async def for_you(request: Request, user=Depends(require_user)) -> Response:
    return await forward(request, RECOMMENDER, user=user)


@app.get("/api/trending", dependencies=[Depends(rate_limit)])
async def trending(request: Request, user=Depends(optional_user)) -> Response:
    return await forward(request, RECOMMENDER, cache_ttl=10, user=user)


@app.post("/api/interactions", dependencies=[Depends(rate_limit)])
async def interactions(request: Request, user=Depends(require_user)) -> Response:
    return await forward(request, CATALOG, user=user)
