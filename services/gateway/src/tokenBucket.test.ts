import { describe, it, expect } from "vitest";
import { simulateTokenBucket, BucketState } from "./tokenBucket.js";

describe("token bucket", () => {
  it("starts full and allows up to capacity in a burst", () => {
    let state: BucketState | null = null;
    const now = 1000;
    let allowedCount = 0;
    for (let i = 0; i < 10; i++) {
      const r = simulateTokenBucket(state, 5, 1, now); // capacity 5
      state = r.state;
      if (r.allowed) allowedCount++;
    }
    expect(allowedCount).toBe(5); // burst bounded by capacity
  });

  it("refills over time at the configured rate", () => {
    // Drain to empty, then wait 2s at 2 tokens/sec -> 4 tokens back.
    let r = simulateTokenBucket(null, 5, 2, 0, 5); // take all 5
    expect(r.remaining).toBeCloseTo(0, 5);
    r = simulateTokenBucket(r.state, 5, 2, 2000, 1); // +2s -> +4 tokens, take 1
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBeCloseTo(3, 5);
  });

  it("never exceeds capacity on refill", () => {
    const r = simulateTokenBucket({ tokens: 5, ts: 0 }, 5, 10, 100000, 0);
    expect(r.remaining).toBe(5);
  });

  it("denies when empty", () => {
    const r = simulateTokenBucket({ tokens: 0, ts: 1000 }, 5, 1, 1000, 1);
    expect(r.allowed).toBe(false);
  });
});
