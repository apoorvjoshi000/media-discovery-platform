"""Qdrant vector-store wrapper: collection setup, upsert, and ANN search."""
from __future__ import annotations

from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

from .config import settings


class VectorStore:
    def __init__(self) -> None:
        self.client = QdrantClient(url=settings.qdrant_url, timeout=30)
        self.collection = settings.qdrant_collection

    def ensure_collection(self) -> None:
        existing = {c.name for c in self.client.get_collections().collections}
        if self.collection not in existing:
            self.client.create_collection(
                collection_name=self.collection,
                # Cosine distance pairs with the normalized embeddings produced
                # by Embedder (normalize_embeddings=True).
                vectors_config=qm.VectorParams(
                    size=settings.embedding_dim, distance=qm.Distance.COSINE
                ),
            )

    def upsert(self, ids: list[int], vectors: list[list[float]], payloads: list[dict]) -> None:
        points = [
            qm.PointStruct(id=i, vector=v, payload=p)
            for i, v, p in zip(ids, vectors, payloads)
        ]
        self.client.upsert(collection_name=self.collection, points=points)

    def search(self, vector: list[float], limit: int = 10, ef: int | None = None) -> list[tuple[int, float]]:
        params = qm.SearchParams(hnsw_ef=ef) if ef else None
        hits = self.client.search(
            collection_name=self.collection,
            query_vector=vector,
            limit=limit,
            search_params=params,
        )
        return [(int(h.id), float(h.score)) for h in hits]

    def count(self) -> int:
        return self.client.count(collection_name=self.collection, exact=True).count


_store: VectorStore | None = None


def get_store() -> VectorStore:
    global _store
    if _store is None:
        _store = VectorStore()
    return _store
