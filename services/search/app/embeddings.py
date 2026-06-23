"""Sentence-transformer embedding wrapper. The model is loaded lazily on first
use so that imports (and the unit tests for fusion) stay cheap."""
from __future__ import annotations

import threading
from functools import lru_cache

from .config import settings


class Embedder:
    """Thin wrapper around a SentenceTransformer. Thread-safe lazy load."""

    def __init__(self, model_name: str) -> None:
        self._model_name = model_name
        self._model = None
        self._lock = threading.Lock()

    def _ensure(self):
        if self._model is None:
            with self._lock:
                if self._model is None:
                    # Imported here so the heavy torch import only happens when
                    # embeddings are actually needed.
                    from sentence_transformers import SentenceTransformer

                    self._model = SentenceTransformer(self._model_name)
        return self._model

    def encode_one(self, text: str) -> list[float]:
        model = self._ensure()
        vec = model.encode(text, normalize_embeddings=True)
        return vec.tolist()

    def encode_many(self, texts: list[str], batch_size: int = 64) -> list[list[float]]:
        model = self._ensure()
        vecs = model.encode(
            texts, batch_size=batch_size, normalize_embeddings=True, show_progress_bar=True
        )
        return [v.tolist() for v in vecs]


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    return Embedder(settings.embedding_model)
