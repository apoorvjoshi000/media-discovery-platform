"""Item-item collaborative filtering - pure, deterministic, unit-tested.

Candidate generation: cosine similarity between items over the implicit
user-interaction matrix ("users who engaged with X also engaged with Y").
Interaction weights: view=1, click=2, play=3 (stronger signal = more weight).

We accumulate dot products only over co-rated item pairs (sparse), so cost is
driven by per-user activity, not the full item x item matrix.
"""
from __future__ import annotations

import math
from collections import defaultdict

WEIGHTS: dict[str, int] = {"view": 1, "click": 2, "play": 3}

# movieId -> list of (neighbor_id, cosine_score), best first
ItemSimilarity = dict[int, list[tuple[int, float]]]


def build_item_similarity(interactions: list[dict], top_k: int = 20) -> ItemSimilarity:
    """interactions: [{userId, movieId, weight}, ...] -> top-k neighbors per item."""
    item_vecs: dict[int, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    user_items: dict[str, dict[int, float]] = defaultdict(lambda: defaultdict(float))

    for it in interactions:
        u, m, w = it["userId"], it["movieId"], it["weight"]
        item_vecs[m][u] += w
        user_items[u][m] += w

    # L2 norm per item.
    norms = {m: math.sqrt(sum(v * v for v in vec.values())) for m, vec in item_vecs.items()}

    # Sparse dot products: for each user, add wa*wb to every co-rated (a,b) pair.
    dots: dict[int, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    for items in user_items.values():
        entries = list(items.items())
        for a in range(len(entries)):
            ia, wa = entries[a]
            for b in range(a + 1, len(entries)):
                ib, wb = entries[b]
                dots[ia][ib] += wa * wb
                dots[ib][ia] += wa * wb

    sim: ItemSimilarity = {}
    for item, partners in dots.items():
        na = norms.get(item, 0.0)
        scored = [
            (other, dot / (na * nb))
            for other, dot in partners.items()
            if na > 0 and (nb := norms.get(other, 0.0)) > 0
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        sim[item] = scored[:top_k]
    return sim


def similar_to(sim: ItemSimilarity, movie_id: int, n: int = 10) -> list[tuple[int, float]]:
    """'More like this' - direct neighbors of a single item."""
    return sim.get(movie_id, [])[:n]


def recommend_for_user(
    sim: ItemSimilarity, user_interactions: dict[int, float], n: int = 10
) -> list[tuple[int, float]]:
    """Aggregate neighbor scores across everything the user engaged with,
    weighted by the user's own interaction strength, excluding seen items."""
    scores: dict[int, float] = defaultdict(float)
    for movie_id, user_weight in user_interactions.items():
        for nb_id, nb_score in sim.get(movie_id, []):
            if nb_id in user_interactions:
                continue  # skip already-seen
            scores[nb_id] += nb_score * user_weight
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return ranked[:n]
