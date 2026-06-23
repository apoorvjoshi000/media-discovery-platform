// Token-bucket rate limiter.
//
// The authoritative implementation runs as a single atomic Lua script inside
// Redis (LUA below) so refill+check+decrement happen race-free under
// concurrency — no read-modify-write window between competing requests.
//
// `simulateTokenBucket` is a pure-JS mirror of the same math, used by the unit
// tests (so the algorithm is verified without a live Redis).
//
// Token bucket is chosen over a fixed window because it permits short bursts
// (up to `capacity`) while bounding the long-run average to `refillRate`/sec.

export const TOKEN_BUCKET_LUA = `
-- KEYS[1] = bucket key
-- ARGV[1] = capacity (max tokens / burst)
-- ARGV[2] = refill rate (tokens per second)
-- ARGV[3] = now (epoch ms)
-- ARGV[4] = requested tokens
local key      = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill   = tonumber(ARGV[2])
local now      = tonumber(ARGV[3])
local needed   = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(bucket[1])
local ts     = tonumber(bucket[2])
if tokens == nil then
  tokens = capacity
  ts = now
end

-- Refill based on elapsed time since the last touch.
local elapsed = math.max(0, now - ts) / 1000.0
tokens = math.min(capacity, tokens + elapsed * refill)

local allowed = 0
if tokens >= needed then
  tokens = tokens - needed
  allowed = 1
end

redis.call('HSET', key, 'tokens', tokens, 'ts', now)
-- Expire idle buckets once they would have fully refilled (keyspace hygiene).
redis.call('PEXPIRE', key, math.ceil(capacity / refill * 1000) + 1000)
return { allowed, tostring(tokens) }
`;

export interface BucketState {
  tokens: number;
  ts: number; // epoch ms of last update
}

export interface BucketResult {
  allowed: boolean;
  remaining: number;
  state: BucketState;
}

// Pure mirror of the Lua logic for tests/reference.
export function simulateTokenBucket(
  prev: BucketState | null,
  capacity: number,
  refillRate: number,
  now: number,
  needed = 1
): BucketResult {
  let tokens = prev ? prev.tokens : capacity;
  const ts = prev ? prev.ts : now;
  const elapsed = Math.max(0, now - ts) / 1000;
  tokens = Math.min(capacity, tokens + elapsed * refillRate);

  let allowed = false;
  if (tokens >= needed) {
    tokens -= needed;
    allowed = true;
  }
  return { allowed, remaining: tokens, state: { tokens, ts: now } };
}
