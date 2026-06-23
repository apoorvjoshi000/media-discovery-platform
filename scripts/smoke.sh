#!/usr/bin/env bash
# Quick health + functional smoke test against a running stack.
set -euo pipefail
GATEWAY="${GATEWAY:-http://localhost:8080}"

pass() { printf "  \033[32mok\033[0m   %s\n" "$1"; }
fail() { printf "  \033[31mfail\033[0m %s\n" "$1"; exit 1; }

echo "==> health checks"
for svc in 8080 8001 8002 8003; do
  curl -fsS "http://localhost:${svc}/health" >/dev/null && pass "service :${svc}" || fail "service :${svc}"
done

echo "==> browse"
curl -fsS "$GATEWAY/api/movies?limit=3" | grep -q '"items"' && pass "GET /api/movies" || fail "browse"

echo "==> semantic search"
curl -fsS -X POST "$GATEWAY/api/search/semantic" \
  -H 'content-type: application/json' \
  -d '{"query":"feel-good space adventure","limit":3}' | grep -q '"items"' \
  && pass "POST /api/search/semantic" || fail "semantic search"

echo "==> hybrid search"
curl -fsS -X POST "$GATEWAY/api/search/hybrid" \
  -H 'content-type: application/json' \
  -d '{"query":"hopeful science fiction","limit":3}' | grep -q '"items"' \
  && pass "POST /api/search/hybrid" || fail "hybrid search"

echo "All smoke checks passed."
