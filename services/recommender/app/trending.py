"""Real-time 'trending now': a sliding-window counter fed by the Kafka stream.
Each interaction adds a time-decayed weight; trending = top items by current
decayed score. O(1) update, no DB round-trip on the hot path."""
from __future__ import annotations

import math
import time

HALF_LIFE_MS = 15 * 60 * 1000  # score halves every 15 minutes
DECAY = math.log(2) / HALF_LIFE_MS


def _now_ms() -> int:
    return int(time.time() * 1000)


class TrendingWindow:
    def __init__(self) -> None:
        # movieId -> (score, last_ts)
        self._items: dict[int, tuple[float, int]] = {}

    def add(self, movie_id: int, weight: float, now: int | None = None) -> None:
        now = now if now is not None else _now_ms()
        if movie_id in self._items:
            score, last = self._items[movie_id]
            score = score * math.exp(-DECAY * (now - last)) + weight
            self._items[movie_id] = (score, now)
        else:
            self._items[movie_id] = (weight, now)

    def top(self, n: int = 10, now: int | None = None) -> list[tuple[int, float]]:
        now = now if now is not None else _now_ms()
        decayed = [
            (mid, score * math.exp(-DECAY * (now - last)))
            for mid, (score, last) in self._items.items()
        ]
        decayed = [(mid, s) for mid, s in decayed if s > 0.01]
        decayed.sort(key=lambda x: x[1], reverse=True)
        return decayed[:n]
