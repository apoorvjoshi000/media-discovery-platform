import { startTracing } from "./tracing.js";
startTracing("recommender");

import express, { Request, Response } from "express";
import pinoHttp from "pino-http";
import { connect, events, close, EventDoc } from "./db.js";
import { startConsumer, stopConsumer } from "./consumer.js";
import { TrendingWindow } from "./trending.js";
import {
  buildItemSimilarity,
  similarTo,
  recommendForUser,
  ItemSimilarity,
  Interaction,
  WEIGHTS,
} from "./cf.js";
import { registry, metricsMiddleware, modelRebuilds, itemsInModel } from "./metrics.js";
import { logger } from "./logger.js";

const PORT = Number(process.env.RECOMMENDER_PORT ?? process.env.PORT ?? 8003);
const CATALOG = process.env.CATALOG_URL ?? "http://localhost:8001";
const REBUILD_MS = Number(process.env.MODEL_REBUILD_MS ?? 60_000);

const trending = new TrendingWindow();
let model: ItemSimilarity = new Map();

// Offline-style rebuild of the item-item model from the full event history.
async function rebuildModel(): Promise<void> {
  const docs = await events().find({}, { projection: { _id: 0 } }).toArray();
  const interactions: Interaction[] = docs.map((d) => ({
    userId: d.userId,
    movieId: d.movieId,
    weight: WEIGHTS[d.type] ?? 1,
  }));
  model = buildItemSimilarity(interactions);
  modelRebuilds.inc();
  itemsInModel.set(model.size);
  logger.info({ items: model.size, events: docs.length }, "model rebuilt");
}

async function hydrate(ids: number[]): Promise<unknown[]> {
  if (!ids.length) return [];
  try {
    const r = await fetch(`${CATALOG}/movies/batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (!r.ok) return [];
    return ((await r.json()) as { items: unknown[] }).items;
  } catch {
    return [];
  }
}

async function userInteractions(userId: string): Promise<Map<number, number>> {
  const docs = await events().find({ userId }).toArray();
  const map = new Map<number, number>();
  for (const d of docs) map.set(d.movieId, (map.get(d.movieId) ?? 0) + (WEIGHTS[d.type] ?? 1));
  return map;
}

async function main(): Promise<void> {
  await connect();
  await rebuildModel();
  await startConsumer(trending, (_e: EventDoc) => {/* model rebuilt on interval */});
  const timer = setInterval(() => void rebuildModel().catch((e) => logger.warn({ e }, "rebuild failed")), REBUILD_MS);

  const app = express();
  app.use(express.json());
  app.use(pinoHttp({ logger }));
  app.use(metricsMiddleware);

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "recommender" }));
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  });

  // "More like this"
  app.get("/recommend/similar/:id", async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const n = Math.min(Number(req.query.n ?? 10), 50);
    const neighbors = similarTo(model, id, n);
    const items = await hydrate(neighbors.map((nb) => nb.id));
    res.json({ source: "item-item-cf", seed: id, items });
  });

  // Personalised home row. Cold-start (no history) -> trending fallback.
  app.get("/recommend/foryou", async (req: Request, res: Response) => {
    const userId = (req.headers["x-user-id"] as string) ?? "";
    const n = Math.min(Number(req.query.n ?? 10), 50);
    if (!userId) return res.status(400).json({ error: "missing user" });
    const history = await userInteractions(userId);
    if (history.size === 0) {
      const items = await hydrate(trending.top(n).map((t) => t.movieId));
      return res.json({ source: "cold-start-trending", items });
    }
    const recs = recommendForUser(model, history, n);
    const items = await hydrate(recs.map((r) => r.id));
    res.json({ source: "collaborative-filtering", items });
  });

  // Real-time trending (decayed counts from the Kafka stream).
  app.get("/trending", async (req: Request, res: Response) => {
    const n = Math.min(Number(req.query.n ?? 10), 50);
    const top = trending.top(n);
    const items = await hydrate(top.map((t) => t.movieId));
    res.json({ source: "realtime-trending", items });
  });

  const server = app.listen(PORT, () => logger.info({ port: PORT }, "recommender listening"));
  const shutdown = async () => {
    clearInterval(timer);
    server.close();
    await Promise.allSettled([stopConsumer(), close()]);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
