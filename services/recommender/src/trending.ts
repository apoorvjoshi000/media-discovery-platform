// Real-time "trending now": a sliding-window counter fed by the Kafka stream.
// Each interaction adds a time-decayed weight; trending = top items by current
// decayed score. O(1) update, no DB round-trip on the hot path.

interface Bucket {
  score: number;
  lastTs: number;
}

const HALF_LIFE_MS = 15 * 60 * 1000; // 15 min: score halves every 15 minutes
const DECAY = Math.LN2 / HALF_LIFE_MS;

export class TrendingWindow {
  private items = new Map<number, Bucket>();

  add(movieId: number, weight: number, now = Date.now()): void {
    const b = this.items.get(movieId);
    if (b) {
      // Decay the existing score to `now`, then add the new weight.
      b.score = b.score * Math.exp(-DECAY * (now - b.lastTs)) + weight;
      b.lastTs = now;
    } else {
      this.items.set(movieId, { score: weight, lastTs: now });
    }
  }

  top(n = 10, now = Date.now()): { movieId: number; score: number }[] {
    return [...this.items.entries()]
      .map(([movieId, b]) => ({ movieId, score: b.score * Math.exp(-DECAY * (now - b.lastTs)) }))
      .filter((x) => x.score > 0.01)
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  }
}
