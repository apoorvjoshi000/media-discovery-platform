"""OpenTelemetry setup for the gateway (no-op without an OTLP endpoint).
Instrumenting httpx makes the trace continue into the downstream services, so a
single request shows up as one end-to-end trace (gateway -> search -> catalog)
in Jaeger."""
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

    provider = TracerProvider(resource=Resource.create({"service.name": "gateway"}))
    provider.add_span_processor(
        BatchSpanProcessor(
            OTLPSpanExporter(endpoint=f"{settings.otel_exporter_otlp_endpoint}/v1/traces")
        )
    )
    trace.set_tracer_provider(provider)
    FastAPIInstrumentor.instrument_app(app)
    HTTPXClientInstrumentor().instrument()
