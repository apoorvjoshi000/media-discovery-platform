"""Prometheus metrics + an ASGI middleware that times every request and labels
it by method, route template, and status. Scraped at GET /metrics."""
from __future__ import annotations

import time

from prometheus_client import Counter, Histogram
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

HTTP_REQUESTS = Counter(
    "catalog_http_requests_total",
    "Total HTTP requests",
    ["method", "route", "status"],
)
HTTP_DURATION = Histogram(
    "catalog_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "route", "status"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5),
)
EVENTS_EMITTED = Counter(
    "catalog_events_emitted_total",
    "Domain events emitted to Kafka",
    ["type"],
)


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        # Use the matched route template (e.g. /movies/{id}) to keep cardinality
        # bounded; fall back to the raw path when no route matched.
        route = request.scope.get("route")
        path = getattr(route, "path", request.url.path)
        labels = (request.method, path, str(response.status_code))
        HTTP_DURATION.labels(*labels).observe(time.perf_counter() - start)
        HTTP_REQUESTS.labels(*labels).inc()
        return response
