// Prometheus metrics shared across the service. Exposed at GET /metrics and
// scraped by Prometheus (see infra/prometheus/prometheus.yml).
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "catalog_" });

export const httpRequests = new Counter({
  name: "catalog_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

// Buckets tuned for a fast CRUD service (sub-second). p50/p95/p99 are derived
// from this histogram in Grafana.
export const httpDuration = new Histogram({
  name: "catalog_http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export const eventsEmitted = new Counter({
  name: "catalog_events_emitted_total",
  help: "Domain events emitted to Kafka",
  labelNames: ["type"],
  registers: [registry],
});

// Express middleware: times every request and records method/route/status.
export function metricsMiddleware(req: any, res: any, next: any): void {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    const route = req.route?.path ?? req.path ?? "unknown";
    const labels = { method: req.method, route, status: String(res.statusCode) };
    end(labels);
    httpRequests.inc(labels);
  });
  next();
}
