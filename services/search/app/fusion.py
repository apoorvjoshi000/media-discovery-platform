"""Reciprocal Rank Fusion (RRF).

Fuses two (or more) ranked lists into one. Chosen over score-normalisation
because it needs no calibration between the keyword (BM25-ish text score) and
vector (cosine) scales - it only uses ranks. k dampens the contribution of
low-ranked items; k=60 is the value from the original Cormack et al. paper.
"""
from __future__ import annotations


def reciprocal_rank_fusion(
    ranked_lists: list[list[int]], k: int = 60
) -> list[tuple[int, float]]:
    """Return [(id, fused_score), ...] sorted by descending fused score.

    ``ranked_lists`` is a list of id-lists, each already ordered best-first.
    """
    scores: dict[int, float] = {}
    for ranked in ranked_lists:
        for rank, doc_id in enumerate(ranked):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank + 1)
    return sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
