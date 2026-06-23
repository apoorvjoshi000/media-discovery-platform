import { describe, it, expect } from "vitest";
import { buildItemSimilarity, similarTo, recommendForUser, Interaction } from "./cf.js";

// Two clusters: {1,2,3} co-watched by users a,b ; {10,11} co-watched by c,d.
const interactions: Interaction[] = [
  { userId: "a", movieId: 1, weight: 1 },
  { userId: "a", movieId: 2, weight: 1 },
  { userId: "a", movieId: 3, weight: 1 },
  { userId: "b", movieId: 1, weight: 1 },
  { userId: "b", movieId: 2, weight: 1 },
  { userId: "c", movieId: 10, weight: 1 },
  { userId: "c", movieId: 11, weight: 1 },
  { userId: "d", movieId: 10, weight: 1 },
  { userId: "d", movieId: 11, weight: 1 },
];

describe("item-item CF", () => {
  it("ranks within-cluster items as most similar", () => {
    const sim = buildItemSimilarity(interactions);
    const neighbors = similarTo(sim, 1).map((n) => n.id);
    expect(neighbors).toContain(2); // 1 and 2 co-watched by a and b
    expect(neighbors).not.toContain(10); // different cluster, never co-watched
  });

  it("produces cosine scores in (0, 1]", () => {
    const sim = buildItemSimilarity(interactions);
    for (const n of similarTo(sim, 1)) {
      expect(n.score).toBeGreaterThan(0);
      expect(n.score).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("recommends unseen neighbors and excludes seen items", () => {
    const sim = buildItemSimilarity(interactions);
    const userSeen = new Map<number, number>([[1, 1]]); // user watched only #1
    const recs = recommendForUser(sim, userSeen).map((r) => r.id);
    expect(recs).toContain(2);
    expect(recs).toContain(3);
    expect(recs).not.toContain(1); // already seen
  });
});
