"""Token-bucket rate limiter.

Token bucket (not fixed-window) so short bursts are allowed while the average
rate stays bounded. The refill + check + decrement runs as a single Redis Lua
script, which Redis executes atomically - so it is race-free even when many
gateway workers hit the same bucket concurrently.

`evaluate()` is a pure-Python mirror of the Lua used for unit tests.
"""
from __future__ import annotations

from .clients import redis
from .config import settings

# KEYS[1]=bucket  ARGV[1]=capacity ARGV[2]=refill/s ARGV[3]=now_ms ARGV[4]=cost
LUA = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])
if tokens == nil then
  tokens = capacity
  ts = now
end

-- Refill proportional to elapsed time, capped at capacity.
local delta = math.max(0, now - ts) / 1000.0
tokens = math.min(capacity, tokens + delta * refill)

local allowed = 0
if tokens >= cost then
  tokens = tokens - cost
  allowed = 1
end

redis.call('HSET', key, 'tokens', tokens, 'ts', now)
-- Expire idle buckets after a full refill window to reclaim memory.
redis.call('PEXPIRE', key, math.ceil(capacity / refill * 1000) + 1000)
return {allowed, tokens}
"""


def evaluate(
    tokens: float | None,
    ts: int | None,
    now: int,
    capacity: float,
    refill: float,
    cost: float = 1,
) -> tuple[bool, float]:
    """Pure mirror of the Lua. Returns (allowed, tokens_remaining)."""
    if tokens is None:
        tokens, ts = capacity, now
    delta = max(0, now - ts) / 1000.0
    tokens = min(capacity, tokens + delta * refill)
    if tokens >= cost:
        return True, tokens - cost
    return False, tokens


class RateLimiter:
    def __init__(self) -> None:
        self._sha: str | None = None

    async def _ensure(self) -> str:
        if self._sha is None:
            self._sha = await redis().script_load(LUA)
        return self._sha

    async def allow(self, key: str, now_ms: int, cost: int = 1) -> tuple[bool, float]:
        sha = await self._ensure()
        allowed, tokens = await redis().evalsha(
            sha,
            1,
            f"rl:{key}",
            settings.rate_limit_capacity,
            settings.rate_limit_refill,
            now_ms,
            cost,
        )
        return bool(int(allowed)), float(tokens)


limiter = RateLimiter()
