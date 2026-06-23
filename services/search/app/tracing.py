"""OpenTelemetry setup for the FastAPI search service. No-op unless an OTLP
endpoint is configured, so tests and local runs stay light."""
from __future__ import annotations

from .config import settings


def init_tracing(app) -> None:
    if not settings.otel_exporter_otlp_endpoint:
        return
    from opentelemetry import trace
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

    provider = TracerProvider(resource=Resource.create({"service.name": "search"}))
    exporter = OTLPSpanExporter(
        endpoint=f"{settings.otel_exporter_otlp_endpoint}/v1/traces"
    )
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    # Instrument the outbound client so the trace continues into the catalog
    # service (gateway -> search -> catalog shows up as one trace in Jaeger).
    HTTPXClientInstrumentor().instrument()
