// Tracing first so http/express get instrumented before import.
import { startTracing } from "./tracing.js";
startTracing("gateway");

import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { registry, metricsMiddleware } from "./metrics.js";
import { authRouter, initUsers, requireAuth, requireRole, optionalAuth } from "./auth.js";
import { rateLimit } from "./rateLimit.js";
import { proxy } from "./proxy.js";
import { logger } from "./logger.js";

const PORT = Number(process.env.GATEWAY_PORT ?? process.env.PORT ?? 8080);
const CATALOG = process.env.CATALOG_URL ?? "http://localhost:8001";
const SEARCH = process.env.SEARCH_URL ?? "http://localhost:8002";
const RECOMMENDER = process.env.RECOMMENDER_URL ?? "http://localhost:8003";

// Tags a route so metrics group by pattern (not by every :id value).
const tag = (pattern: string) => (req: Request, _res: Response, next: NextFunction) => {
  req.routePattern = pattern;
  next();
};

async function main(): Promise<void> {
  await initUsers(process.env.MONGO_URI ?? "mongodb://localhost:27017/media");

  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));
  app.use(metricsMiddleware);

  // --- platform endpoints ---
  app.get("/health", (_req, res) => res.json({ status: "ok", service: "gateway" }));
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  });

  // --- auth (rate-limited by IP) ---
  app.use("/api/auth", tag("/api/auth"), optionalAuth, rateLimit, authRouter);

  // --- catalog: browse + detail (cached, optional auth) ---
  app.get("/api/movies", tag("/api/movies"), optionalAuth, rateLimit, proxy({ target: CATALOG, cacheTtl: 30 }));
  app.get("/api/movies/:id", tag("/api/movies/:id"), optionalAuth, rateLimit, proxy({ target: CATALOG, cacheTtl: 60 }));

  // --- search: semantic / keyword / hybrid (cached, optional auth) ---
  app.post("/api/search/:mode", tag("/api/search/:mode"), optionalAuth, rateLimit, proxy({ target: SEARCH, cacheTtl: 60 }));

  // --- recommender ---
  app.get("/api/recommend/similar/:id", tag("/api/recommend/similar"), optionalAuth, rateLimit, proxy({ target: RECOMMENDER }));
  app.get("/api/recommend/foryou", tag("/api/recommend/foryou"), requireAuth, rateLimit, proxy({ target: RECOMMENDER }));
  app.get("/api/trending", tag("/api/trending"), optionalAuth, rateLimit, proxy({ target: RECOMMENDER, cacheTtl: 10 }));

  // --- interactions (auth required; forwarded so catalog can emit to Kafka) ---
  app.post("/api/interactions", tag("/api/interactions"), requireAuth, rateLimit, proxy({ target: CATALOG }));

  // --- admin: upsert a movie ---
  app.put("/api/movies/:id", tag("/api/movies/:id"), requireAuth, requireRole("admin"), proxy({ target: CATALOG }));

  const server = app.listen(PORT, () => logger.info({ port: PORT }, "gateway listening"));
  const shutdown = () => { server.close(); process.exit(0); };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
