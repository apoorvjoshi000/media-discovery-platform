// Item-item collaborative filtering — pure, deterministic, unit-tested.
//
// Candidate generation: cosine similarity between items over the implicit
// user-interaction matrix. "Users who engaged with X also engaged with Y."
// Interaction weights: view=1, click=2, play=3 (stronger signal = more weight).

export interface Interaction {
  userId: string;
  movieId: number;
  weight: number;
}

export type Neighbor = { id: number; score: number };
export type ItemSimilarity = Map<number, Neighbor[]>;

export const WEIGHTS: Record<string, number> = { view: 1, click: 2, play: 3 };

// Build top-K cosine-similar neighbors for every item.
export function buildItemSimilarity(interactions: Interaction[], topK = 20): ItemSimilarity {
  // item -> (user -> summed weight)
  const itemVecs = new Map<number, Map<string, number>>();
  // user -> (item -> summed weight)
  const userItems = new Map<string, Map<number, number>>();

  for (const { userId, movieId, weight } of interactions) {
    if (!itemVecs.has(movieId)) itemVecs.set(movieId, new Map());
    const iv = itemVecs.get(movieId)!;
    iv.set(userId, (iv.get(userId) ?? 0) + weight);

    if (!userItems.has(userId)) userItems.set(userId, new Map());
    const ui = userItems.get(userId)!;
    ui.set(movieId, (ui.get(movieId) ?? 0) + weight);
  }

  // L2 norm per item.
  const norms = new Map<number, number>();
  for (const [item, vec] of itemVecs) {
    let sum = 0;
    for (const w of vec.values()) sum += w * w;
    norms.set(item, Math.sqrt(sum));
  }

  // Accumulate dot products only over co-rated pairs (sparse): walk each user's
  // items and add weight_a * weight_b to every (a,b) pair.
  const dots = new Map<number, Map<number, number>>();
  for (const items of userItems.values()) {
    const entries = [...items.entries()];
    for (let a = 0; a < entries.length; a++) {
      for (let b = a + 1; b < entries.length; b++) {
        const [ia, wa] = entries[a];
        const [ib, wb] = entries[b];
        addDot(dots, ia, ib, wa * wb);
        addDot(dots, ib, ia, wa * wb);
      }
    }
  }

  const sim: ItemSimilarity = new Map();
  for (const [item, partners] of dots) {
    const na = norms.get(item) ?? 0;
    const scored: Neighbor[] = [];
    for (const [other, dot] of partners) {
      const nb = norms.get(other) ?? 0;
      if (na > 0 && nb > 0) scored.push({ id: other, score: dot / (na * nb) });
    }
    scored.sort((x, y) => y.score - x.score);
    sim.set(item, scored.slice(0, topK));
  }
  return sim;
}

function addDot(dots: Map<number, Map<number, number>>, a: number, b: number, v: number): void {
  if (!dots.has(a)) dots.set(a, new Map());
  const m = dots.get(a)!;
  m.set(b, (m.get(b) ?? 0) + v);
}

// "More like this" — direct neighbors of a single item.
export function similarTo(sim: ItemSimilarity, movieId: number, n = 10): Neighbor[] {
  return (sim.get(movieId) ?? []).slice(0, n);
}

// Personalised: aggregate neighbor scores across everything the user engaged
// with, weighted by the user's own interaction strength, excluding seen items.
export function recommendForUser(
  sim: ItemSimilarity,
  userInteractions: Map<number, number>, // movieId -> weight
  n = 10
): Neighbor[] {
  const scores = new Map<number, number>();
  for (const [movieId, userWeight] of userInteractions) {
    for (const nb of sim.get(movieId) ?? []) {
      if (userInteractions.has(nb.id)) continue; // skip already-seen
      scores.set(nb.id, (scores.get(nb.id) ?? 0) + nb.score * userWeight);
    }
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}
