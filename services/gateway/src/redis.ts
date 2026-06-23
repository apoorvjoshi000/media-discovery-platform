// Redis client + the two things the gateway uses it for:
//   1. atomic token-bucket rate limiting (Lua, registered as a command)
//   2. a small response cache with single-flight stampede protection
import Redis from "ioredis";
import { TOKEN_BUCKET_LUA } from "./tokenBucket.js";
import { logger } from "./logger.js";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: 2,
  lazyConnect: false,
});

redis.on("error", (err) => logger.warn({ err }, "redis error"));

// Register the Lua script as a custom command; ioredis handles EVALSHA caching.
redis.defineCommand("tokenBucket", { numberOfKeys: 1, lua: TOKEN_BUCKET_LUA });

export interface RateResult {
  allowed: boolean;
  remaining: number;
}

export async function consumeToken(
  key: string,
  capacity: number,
  refillRate: number,
  needed = 1
): Promise<RateResult> {
  try {
    // @ts-expect-error custom command added at runtime
    const [allowed, remaining]: [number, string] = await redis.tokenBucket(
      key,
      capacity,
      refillRate,
      Date.now(),
      needed
    );
    return { allowed: allowed === 1, remaining: parseFloat(remaining) };
  } catch (err) {
    // Fail open: if Redis is down, don't block traffic (availability > limiting).
    logger.warn({ err }, "rate limiter unavailable - failing open");
    return { allowed: true, remaining: capacity };
  }
}

// ---- response cache with single-flight ----
// Returns cached JSON string or null. On miss, the caller computes the value
// and calls cacheSet. A short NX lock prevents a stampede recomputing a cold key.
export async function cacheGet(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSec: number): Promise<void> {
  try {
    // Jitter the TTL ±10% so a wave of keys doesn't all expire on the same tick.
    const jitter = Math.floor(ttlSec * (0.9 + Math.random() * 0.2));
    await redis.set(key, value, "EX", jitter);
  } catch {
    /* cache is best-effort */
  }
}

export async function acquireLock(key: string, ttlSec = 5): Promise<boolean> {
  try {
    const res = await redis.set(`lock:${key}`, "1", "EX", ttlSec, "NX");
    return res === "OK";
  } catch {
    return true; // best-effort
  }
}
