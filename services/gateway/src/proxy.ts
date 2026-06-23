// Lightweight reverse proxy. Forwards a request to a downstream service using
// the platform fetch, propagates the authenticated user as a header, and
// (optionally) caches idempotent responses in Redis with single-flight.
import { Request, Response } from "express";
import { cacheGet, cacheSet, acquireLock } from "./redis.js";
import { cacheOps } from "./metrics.js";

interface ProxyOptions {
  target: string; // base URL of the downstream service
  cacheTtl?: number; // seconds; if set, GET/POST responses are cached
}

export function proxy(opts: ProxyOptions) {
  return async (req: Request, res: Response): Promise<void> => {
    const url = `${opts.target}${req.originalUrl.replace(/^\/api/, "")}`;
    const cacheKey = opts.cacheTtl
      ? `cache:${req.method}:${url}:${JSON.stringify(req.body ?? {})}`
      : null;

    // --- cache read ---
    if (cacheKey) {
      const cached = await cacheGet(cacheKey);
      if (cached) {
        cacheOps.inc({ result: "hit" });
        res.setHeader("X-Cache", "HIT");
        res.type("application/json").send(cached);
        return;
      }
      cacheOps.inc({ result: "miss" });
    }

    const headers: Record<string, string> = { "content-type": "application/json" };
    if (req.user) headers["x-user-id"] = req.user.sub;
    if (req.user) headers["x-user-role"] = req.user.role;

    try {
      const upstream = await fetch(url, {
        method: req.method,
        headers,
        body: ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
      });
      const text = await upstream.text();

      // --- cache write (single-flight) ---
      if (cacheKey && upstream.ok) {
        if (await acquireLock(cacheKey)) await cacheSet(cacheKey, text, opts.cacheTtl!);
      }
      res.status(upstream.status);
      res.setHeader("X-Cache", cacheKey ? "MISS" : "BYPASS");
      res.type(upstream.headers.get("content-type") ?? "application/json").send(text);
    } catch {
      res.status(502).json({ error: `upstream ${opts.target} unavailable` });
    }
  };
}
