"""One-off ingest: embed every movie overview and upsert into Qdrant.

    python ingest_embeddings.py                              # bundled sample
    python ingest_embeddings.py --dataset data/tmdb_5000.csv # TMDB 5000

Re-runnable: upserts are keyed on movieId, so re-indexing is idempotent.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
import time
from pathlib import Path

from app.config import settings
from app.embeddings import get_embedder
from app.qdrant_store import get_store


def load_sample(path: Path) -> list[dict]:
    with path.open() as fh:
        return json.load(fh)


def load_tmdb_csv(path: Path) -> list[dict]:
    rows: list[dict] = []
    csv.field_size_limit(10**7)
    with path.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            overview = (r.get("overview") or "").strip()
            if not overview or not r.get("id"):
                continue
            try:
                genres = [g["name"] for g in json.loads(r.get("genres") or "[]")]
            except (json.JSONDecodeError, TypeError, KeyError):
                genres = []
            rows.append(
                {
                    "movieId": int(r["id"]),
                    "title": r.get("title", ""),
                    "year": int(r["release_date"][:4]) if r.get("release_date") else 0,
                    "genres": genres,
                    "language": r.get("original_language", "en"),
                    "overview": overview,
                }
            )
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", help="path to TMDB CSV; omit for the bundled sample")
    ap.add_argument("--batch-size", type=int, default=64)
    args = ap.parse_args()

    if args.dataset and args.dataset.endswith(".csv"):
        movies = load_tmdb_csv(Path(args.dataset))
    else:
        default = Path(__file__).resolve().parents[2] / "data" / "sample_movies.json"
        movies = load_sample(Path(args.dataset) if args.dataset else default)

    if not movies:
        print("no movies to ingest", file=sys.stderr)
        sys.exit(1)

    print(f"embedding {len(movies)} overviews with {settings.embedding_model} ...")
    t0 = time.perf_counter()
    vectors = get_embedder().encode_many([m["overview"] for m in movies], args.batch_size)
    print(f"embedded in {time.perf_counter() - t0:.1f}s")

    store = get_store()
    store.ensure_collection()
    store.upsert(
        ids=[m["movieId"] for m in movies],
        vectors=vectors,
        payloads=[
            {"movieId": m["movieId"], "title": m["title"], "genres": m.get("genres", [])}
            for m in movies
        ],
    )
    print(f"upserted {len(movies)} vectors -> collection '{settings.qdrant_collection}'")
    print(f"collection now holds {store.count()} vectors")


if __name__ == "__main__":
    main()
