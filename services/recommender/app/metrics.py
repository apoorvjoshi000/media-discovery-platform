"""Prometheus metrics + request-timing middleware for the recommender."""
from __future__ import annotations

import time

from prometheus_client import Counter, Gauge, Histogram
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

HTTP_REQUESTS = Counter(
    "recommender_http_requests_total", "Total HTTP requests", ["method", "route", "status"]
)
HTTP_DURATION = Histogram(
    "recommender_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "route", "status"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1),
)
EVENTS_CONSUMED = Counter(
    "recommender_events_consumed_total", "Interaction events consumed from Kafka", ["type"]
)
MODEL_REBUILDS = Counter("recommender_model_rebuilds_total", "Item-item model rebuild count")
ITEMS_IN_MODEL = Gauge(
    "recommender_items_in_model", "Items with at least one neighbor in the current model"
)


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        labels = (request.method, path, str(response.status_code))
        HTTP_DURATION.labels(*labels).observe(time.perf_counter() - start)
        HTTP_REQUESTS.labels(*labels).inc()
        return response
