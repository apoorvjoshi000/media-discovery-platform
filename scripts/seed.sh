#!/usr/bin/env bash
# End-to-end seed: ingest the catalog into Mongo, build the vector index in
# Qdrant, create a demo user, and generate some interaction events so the
# recommender + trending have data. Run AFTER `docker compose up`.
set -euo pipefail

GATEWAY="${GATEWAY:-http://localhost:8080}"

echo "==> 1/4 Ingesting catalog into Mongo (catalog service)"
docker compose exec -T catalog npm run ingest

echo "==> 2/4 Building embeddings + Qdrant index (search service)"
docker compose exec -T search python ingest_embeddings.py

echo "==> 3/4 Creating demo user (first user becomes admin)"
curl -s -X POST "$GATEWAY/api/auth/signup" \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"password123"}' >/dev/null || true

TOKEN=$(curl -s -X POST "$GATEWAY/api/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"password123"}' | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')

echo "==> 4/4 Generating interaction events (drives trending + CF)"
for id in 1 1 5 5 5 7 10 10 16 2 8; do
  curl -s -X POST "$GATEWAY/api/interactions" \
    -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' \
    -d "{\"type\":\"play\",\"movieId\":$id}" >/dev/null
done

echo "Done. Open http://localhost:3000 (app) and http://localhost:3001 (Grafana)."
