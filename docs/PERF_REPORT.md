# Performance report

All numbers below are **measured from a real local run**, not estimated. Re-run
on a bigger machine or the TMDB 5000 dataset for headline figures.

## Environment
- Host: Apple Silicon, macOS, 8 GB RAM
- Docker engine: Colima VM, **4 vCPU / 5 GB**
- Dataset: bundled sample, **16 titles** indexed (run TMDB 5000 for scale)
- Embedding model: `all-MiniLM-L6-v2` (384-d), cosine, Qdrant HNSW
- Load tool: k6, ramping 0 -> 50 -> 100 VUs over 60s, hitting
  `/api/search/{hybrid|semantic|keyword}` through the gateway

## Headline numbers (measured)
| Metric | Result | How |
|---|---|---|
| Search p99 latency, warm (cache on) | **76 ms** | k6, 100 VUs, 60s |
| Search p95 latency, warm | **31 ms** | same run |
| Sustained throughput, warm | **265 req/s** | same run, 0% errors |
| Search p99 latency, cold (cache off) | **3.35 s** | k6, cache disabled |
| Sustained throughput, cold | **54 req/s** | same run, 0% errors |
| Single semantic query, cold (unloaded) | **~50 ms** | one embed + Qdrant ANN |
| Single semantic query, warm (cached) | **~3 ms** | repeat query, Redis hit |
| Cache hit ratio under load | **~99.8%** | `gateway_cache_ops_total` (5614 hit / 13 miss) |
| Error rate (both runs) | **0%** | k6 `http_req_failed` |

## The story these numbers tell
1. **The response cache is the single biggest lever.** Turning on caching of the
   read-style search POST lifted sustained throughput **~5x (54 -> 265 req/s)**
   and cut p99 from **3.35 s to 76 ms** on the same hardware.
2. **Uncached, the bottleneck is CPU-bound embedding.** Each semantic/hybrid
   request runs the MiniLM encoder. A single embed is ~50 ms, but at 100 VUs on
   4 vCPUs the encoder saturates the CPU and p99 blows out to seconds. Two fixes
   are already in the code:
   - the encoder runs in a **threadpool** (`run_in_threadpool`) so it does not
     block the event loop, and
   - identical queries are served from **Redis cache** instead of re-embedding.
   The next step (designed, not yet run here) is to **scale the search service
   horizontally** (2+ replicas behind the gateway) and/or quantize the model.
3. **Connection pooling** on Mongo (`maxPoolSize=50`) and httpx
   (`max_connections=200`) keeps the gateway and catalog from exhausting sockets
   under the 100-VU burst.

## Rate limiting
The gateway enforces a **token bucket** (default capacity 60, refill 30/s per
identity). For the throughput benchmark above it was raised so the limiter was
not the bottleneck. With defaults, a single source IP is correctly throttled:
a 200-request concurrent burst returned **80 x 200 and 120 x 429** (capacity +
refill worth allowed, the rest rejected with `Retry-After`).

## Chaos test (graceful degradation, measured)
With steady traffic to both the catalog (`/api/movies`) and search
(`/api/search/semantic`, unique queries so each one actually reaches the search
service), the search container was killed mid-run with `docker compose kill
search`, then restarted:

| Phase | catalog `/api/movies` | search `/api/search` |
|---|---|---|
| before (search up) | 200 x16 | 200 x16 |
| **search killed** | **200 x24 (100%)** | **502 x24** |
| search recovered | 200 | 200 (~67 to 240 ms) |

The key result: during the search outage the catalog kept serving **100%** of
requests while search failed **in isolation** with `502` (no cascade), because
the gateway proxies per route and turns a dead upstream into a `502` on that
route only. After `docker compose up -d search`, search returned to `200`
(the first request after restart is slower while the embedding model reloads).
Reproduce with `bash` over the steps above, or the drill in
[`loadtest/README.md`](../loadtest/README.md).

## Reproduce
```bash
make up && make seed
# warm (caching on, as shipped):
docker run --rm -i --network media-platform_default -e BASE=http://gateway:8080 \
  grafana/k6 run - < loadtest/search.js
# cache hit ratio:
curl -s localhost:8080/metrics | grep gateway_cache_ops_total
```

## Open items
- Run on TMDB 5000 (5k titles) for a headline catalog-size number.
- Add a search replica and re-measure cold-path throughput.
- Recommender Recall@10 on a held-out split (needs a ratings dataset).
