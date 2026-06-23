# Performance report

> Fill these in from your own run. Every number on the CV must come from this
> file — measured, not estimated. Commit the Grafana screenshots alongside it.

## Environment
- Machine: `[CPU / RAM / OS]`
- Dataset: `[sample 16 | TMDB 5000]` → **`[N]`** titles indexed
- Embedding model: `all-MiniLM-L6-v2` (384-d), cosine, HNSW

## Headline numbers (target → measured)
| Metric | Target | Measured | How |
|---|---|---|---|
| Semantic search p95 latency (warm) | < 150 ms | `[ ]` | Grafana `search_request_duration_seconds`, mode=semantic |
| Hybrid search p95 latency | < 200 ms | `[ ]` | Grafana, mode=hybrid |
| Cache hit ratio (hot queries) | > 60% | `[ ]` | `gateway_cache_ops_total` hit/(hit+miss) |
| Sustained throughput before p99 > 300 ms | report | `[ ] req/s` | `k6 run loadtest/search.js` |
| Recommender Recall@10 (held-out) | report | `[ ]` | offline eval split |
| Test coverage (gateway + catalog) | > 70% | `[ ]` | `npm test -- --coverage` |
| Per-hop overhead (gateway↔service) | report | `[ ] ms` | trace span breakdown in Jaeger |

## Load test
```
k6 run loadtest/search.js
```
Paste the k6 summary here (http_req_duration p95/p99, RPS, error rate).

## What broke first (and the fix)
- `[e.g. Mongo connection exhaustion at ~80 RPS → set maxPoolSize=50 → p99 X→Y ms]`

## Chaos test
- Killed `search` mid-load: `/api/search/*` returned 502, `/api/movies` stayed
  200, no cascading failure. Recovery time after `docker compose up -d search`: `[ ]s`.
