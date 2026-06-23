"""One-off ingest: load movies into Mongo.

    python ingest.py                              # bundled sample (16 titles)
    python ingest.py --dataset data/tmdb_5000.csv # TMDB 5000

Idempotent: upserts keyed on movieId, safe to re-run.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from pymongo import UpdateOne

from app import db
from app.csv_util import parse_tmdb_csv


def _default_dataset() -> Path:
    # /data is the canonical in-container location (compose mounts ./data there).
    p = Path("/data/sample_movies.json")
    if p.exists():
        return p
    return Path(__file__).resolve().parent.parent.parent / "data" / "sample_movies.json"


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", help="path to TMDB CSV; omit for the bundled sample")
    args = ap.parse_args()

    if args.dataset and args.dataset.endswith(".csv"):
        records = [m for m in parse_tmdb_csv(Path(args.dataset).read_text()) if m["overview"]]
        print(f"parsed {len(records)} rows from {args.dataset}")
    else:
        path = Path(args.dataset) if args.dataset else _default_dataset()
        records = json.loads(path.read_text())
        print(f"loaded {len(records)} rows from {path}")

    if not records:
        print("no movies to ingest", file=sys.stderr)
        sys.exit(1)

    await db.connect()
    ops = [UpdateOne({"movieId": m["movieId"]}, {"$set": m}, upsert=True) for m in records]
    res = await db.movies().bulk_write(ops, ordered=False)
    print(f"ingest complete: upserted={res.upserted_count} modified={res.modified_count}")
    await db.close()


if __name__ == "__main__":
    asyncio.run(main())
