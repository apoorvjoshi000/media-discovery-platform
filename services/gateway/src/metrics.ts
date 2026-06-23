// Prometheus metrics for the gateway. The cache-hit and rate-limit counters
// feed the headline numbers in the Grafana dashboard.
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "gateway_" });

export const httpRequests = new Counter({
  name: "gateway_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: "gateway_http_request_duration_seconds",
  help: "End-to-end gateway latency in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const rateLimited = new Counter({
  name: "gateway_rate_limited_total",
  help: "Requests rejected by the rate limiter (429)",
  labelNames: ["route"],
  registers: [registry],
});

export const cacheOps = new Counter({
  name: "gateway_cache_ops_total",
  help: "Gateway response-cache hits and misses",
  labelNames: ["result"], // hit | miss
  registers: [registry],
});

export function metricsMiddleware(req: any, res: any, next: any): void {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    const route = req.routePattern ?? req.path ?? "unknown";
    const labels = { method: req.method, route, status: String(res.statusCode) };
    end(labels);
    httpRequests.inc(labels);
  });
  next();
}
