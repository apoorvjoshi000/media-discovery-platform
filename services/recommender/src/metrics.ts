import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from "prom-client";

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: "recommender_" });

export const httpRequests = new Counter({
  name: "recommender_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: "recommender_http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [registry],
});

export const eventsConsumed = new Counter({
  name: "recommender_events_consumed_total",
  help: "Interaction events consumed from Kafka",
  labelNames: ["type"],
  registers: [registry],
});

export const modelRebuilds = new Counter({
  name: "recommender_model_rebuilds_total",
  help: "Item-item model rebuild count",
  registers: [registry],
});

export const itemsInModel = new Gauge({
  name: "recommender_items_in_model",
  help: "Number of items with at least one neighbor in the current model",
  registers: [registry],
});

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
