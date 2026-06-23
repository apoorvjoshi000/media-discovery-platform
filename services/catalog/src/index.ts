// Tracing must be the very first import so auto-instrumentation can patch
// http/express/mongodb before they are required.
import { startTracing } from "./tracing.js";
startTracing("catalog");

import express from "express";
import pinoHttp from "pino-http";
import { connect, close } from "./db.js";
import { initProducer, closeProducer } from "./events.js";
import { registry, metricsMiddleware } from "./metrics.js";
import { router } from "./routes.js";
import { logger } from "./logger.js";

const PORT = Number(process.env.CATALOG_PORT ?? process.env.PORT ?? 8001);

async function main(): Promise<void> {
  await connect();
  await initProducer();

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));
  app.use(metricsMiddleware);

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "catalog" }));
  app.get("/metrics", async (_req, res) => {
    res.set("Content-Type", registry.contentType);
    res.end(await registry.metrics());
  });
  app.use("/", router);

  const server = app.listen(PORT, () => logger.info({ port: PORT }, "catalog listening"));

  const shutdown = async () => {
    logger.info("shutting down catalog");
    server.close();
    await Promise.allSettled([closeProducer(), close()]);
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
