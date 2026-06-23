"""Dependency-free TMDB 5000 CSV parser. Kept separate from ingest so it can be
unit-tested without a database."""
from __future__ import annotations

import csv
import io
import json


def parse_tmdb_csv(text: str) -> list[dict]:
    """Map TMDB 5000 rows into our movie schema. Skips rows with no id."""
    csv.field_size_limit(10**7)
    out: list[dict] = []
    for r in csv.DictReader(io.StringIO(text)):
        if not r.get("id"):
            continue
        try:
            genres = [g["name"] for g in json.loads(r.get("genres") or "[]")]
        except (json.JSONDecodeError, TypeError, KeyError):
            genres = []
        out.append(
            {
                "movieId": int(r["id"]),
                "title": r.get("title", ""),
                "year": int(r["release_date"][:4]) if r.get("release_date") else 0,
                "genres": genres,
                "language": r.get("original_language", "en"),
                "overview": (r.get("overview") or "").strip(),
                "voteAverage": float(r["vote_average"]) if r.get("vote_average") else None,
                "runtime": int(float(r["runtime"])) if r.get("runtime") else None,
            }
        )
    return out
