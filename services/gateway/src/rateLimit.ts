// Per-identity token-bucket rate-limit middleware. Keyed by authenticated user
// when present, else by client IP. Adds standard X-RateLimit-* headers.
import { Request, Response, NextFunction } from "express";
import { consumeToken } from "./redis.js";
import { rateLimited } from "./metrics.js";

const CAPACITY = Number(process.env.RATE_LIMIT_CAPACITY ?? 60);
const REFILL = Number(process.env.RATE_LIMIT_REFILL ?? 30);

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const identity = req.user?.sub ?? req.ip ?? "anonymous";
  consumeToken(`rl:${identity}`, CAPACITY, REFILL)
    .then(({ allowed, remaining }) => {
      res.setHeader("X-RateLimit-Limit", String(CAPACITY));
      res.setHeader("X-RateLimit-Remaining", String(Math.floor(remaining)));
      if (!allowed) {
        rateLimited.inc({ route: req.routePattern ?? req.path });
        res.setHeader("Retry-After", "1");
        res.status(429).json({ error: "rate limit exceeded" });
        return;
      }
      next();
    })
    .catch(next);
}
