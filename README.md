# Media-Discovery Platform

An **event-driven, observable, fault-tolerant backend** (Python/FastAPI
microservices) that serves **semantic search and recommendations** and is built
to stay fast and correct under load and when a service fails. A movie catalog is
the workload; the systems engineering around it is the point.

[![CI](https://github.com/apoorvjoshi000/media-discovery-platform/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)
![license](https://img.shields.io/badge/license-MIT-blue)
![stack](https://img.shields.io/badge/stack-FastAPI%20%C2%B7%20Qdrant%20%C2%B7%20Kafka%20%C2%B7%20Redis-6ea8fe)

> **Status:** runs end-to-end via Docker Compose. The whole backend is Python
> (FastAPI); the frontend is a thin Next.js client. All numbers below are
> measured on a real local run, recorded in
> [`docs/PERF_REPORT.md`](docs/PERF_REPORT.md).

---

## The problem it solves

Adding "search that understands meaning" or a recommender to a product is easy to
prototype in a notebook and hard to run as a real service. The embedding model is
a few lines; the difficulty is everything around it: keeping latency low when
traffic spikes, making sure one slow or dead dependency does not take the whole
product down, controlling abuse, and being able to see what is happening inside
the system in production.

This project is that production layer. It wraps a semantic plus keyword search
engine and a recommender in the infrastructure a real product needs: an
authenticated, rate-limited, cached API gateway; an event-streaming pipeline that
decouples user writes from the recommendation model; and metrics plus distributed
tracing on every service. The result is a system that sustains hundreds of
requests per second, degrades gracefully when a service is killed, and can be
debugged from a dashboard rather than from guesswork.

In short: the retrieval is a standard technique; the engineering that makes it
fast, reliable, and observable is the actual work.

## Engineering highlights (all measured)

Measured with k6 on a 4-vCPU Docker VM (full method in
[`docs/PERF_REPORT.md`](docs/PERF_REPORT.md)):

- **Caching is the biggest lever:** adding a response cache lifted sustained
  throughput **~5x (54 to 265 req/s)** and cut **p99 latency from 3.35 s to
  76 ms**, with a **~99.8% cache hit ratio** and **0 errors** under load.
- **Abuse control:** a token-bucket rate limiter implemented as an **atomic Redis
  Lua script** (race-free across workers) allowed 80 and rejected 120 on a
  200-request concurrent burst, returning `Retry-After`.
- **Graceful degradation:** the gateway isolates routes, so a dead upstream
  returns `502` on only its own route while the rest of the API keeps serving
  `200` (chaos drill in [`loadtest/README.md`](loadtest/README.md)).
- **Real-time, decoupled recommendations:** user interactions flow through
  **Kafka** to a consumer that updates a time-decay "trending" window in real
  time; the item-item model rebuilds from the replayable event log, so the write
  path never blocks on the recommender being up.
- **Honest bottleneck:** uncached, the limit is CPU-bound embedding on 4 vCPUs;
  the code already offloads embedding to a threadpool and the path forward is to
  scale the search service horizontally.

## What it does

- **Semantic search** over plot embeddings (`all-MiniLM-L6-v2`, 384-d) in a
  **Qdrant** HNSW index.
- **Hybrid search** = keyword (Mongo text) + vector, fused with **Reciprocal
  Rank Fusion**, so meaning-based queries work without breaking exact-match ones.
- **Recommender**: item-item collaborative filtering ("more like this") plus a
  personalised "for you" row, with **real-time trending** from the Kafka stream.
- **API gateway**: JWT auth (short-lived access token + httpOnly refresh cookie,
  RBAC), **token-bucket rate limiting**, response **cache**, and CORS.
- **Observability**: Prometheus metrics on every service, a Grafana dashboard,
  and **distributed tracing** (OpenTelemetry to Jaeger) across gateway, search,
  and catalog.

## Architecture
See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full diagram and data
flows. Four backend services (gateway, catalog, recommender, search) plus a
Next.js web client, over MongoDB, Qdrant, Redis, and Kafka.

```
  Browser -> Next.js web -> API Gateway (auth, rate-limit, cache, routing)
                                 |
              +------------------+------------------+
              v                  v                  v
          Catalog            Search             Recommender
         (Mongo)         (Qdrant + MiniLM)    (Mongo + Kafka consumer)
              |                                     ^
              +------------- Kafka -----------------+
                     (interaction event stream)
        Prometheus scrapes /metrics -> Grafana ; traces -> Jaeger
```

## Tech stack
| Layer | Tech |
|---|---|
| Backend services | Python + FastAPI (gateway, catalog, recommender, search) |
| Frontend | Next.js (App Router, TypeScript), TailwindCSS |
| Data | MongoDB, Qdrant (vectors), Redis (cache + rate-limit) |
| Streaming | Apache Kafka (KRaft, single node) |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` |
| Observability | Prometheus, Grafana, OpenTelemetry, Jaeger |
| Testing / load | pytest, k6 |
| Infra | Docker Compose, GitHub Actions CI |

Everything an interviewer is likely to probe (the token-bucket Lua, RRF, JWT
storage, item-item CF, cold-start, the load-test bottleneck) is Python you can
read top to bottom.

---

## Quickstart
Requires Docker + Docker Compose.

```bash
cp .env.example .env            # adjust secrets if you like
make up                         # build + start everything (first run pulls the model)
make seed                       # ingest catalog + build embeddings
make smoke                      # verify the stack end-to-end
```
Then open:
| URL | What |
|---|---|
| http://localhost:3000 | The app (search, browse, trending, "more like this") |
| http://localhost:8080/health | Gateway health |
| http://localhost:3001 | Grafana dashboard (anonymous admin) |
| http://localhost:9090 | Prometheus |
| http://localhost:16686 | Jaeger traces |

Try a query like **"hopeful science fiction about saving earth"** in `semantic`
or `hybrid` mode and compare it against `keyword`.

> **Running on a small machine (8 GB RAM):** bring up the core app without the
> heavier extras: `docker compose up -d mongo redis qdrant catalog search
> recommender gateway web`. Add `kafka` for trending, and
> `prometheus grafana jaeger` for the dashboards, as separate steps.

### Without `make`
```bash
docker compose up --build -d
docker compose exec catalog python ingest.py
docker compose exec search python ingest_embeddings.py
```

### Load & chaos test
```bash
k6 run loadtest/search.js          # see loadtest/README.md for the chaos drill
```

### Run the bigger dataset (TMDB 5000)
Drop `tmdb_5000_movies.csv` into `data/`, then:
```bash
docker compose exec catalog python ingest.py --dataset /data/tmdb_5000_movies.csv
docker compose exec search python ingest_embeddings.py --dataset /data/tmdb_5000_movies.csv
```

---

## Tests
```bash
make test            # unit tests for all services (pytest)
```
All four backend services have unit tests for their core logic: RRF fusion
(search), item-item CF + trending decay (recommender), the token-bucket math
(gateway), and the TMDB CSV parser (catalog). CI runs them plus image builds on
every push ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Repo layout
```
services/
  gateway/      FastAPI - auth, rate limit, routing, cache, metrics
  catalog/      FastAPI - movie CRUD, Mongo text search, Kafka producer
  search/       FastAPI - embeddings, Qdrant ANN, hybrid RRF
  recommender/  FastAPI - item-item CF, trending, Kafka consumer
web/            Next.js frontend (thin client)
infra/          Prometheus config + Grafana provisioning & dashboard
loadtest/       k6 script + chaos drill
scripts/        seed.sh, smoke.sh
docs/           ARCHITECTURE, API, PERF_REPORT
```

## Deployment
- **Local:** `docker compose up --build` (above).
- **Single VM:** clone, set `.env`, `docker compose up -d`, put Nginx in front
  on :80.
- **Render/Railway:** each service deploys from its own Dockerfile.

---

## Performance detail
Measured on a 4-vCPU Docker VM against the bundled 16-title sample (full method
and reproduction in [`docs/PERF_REPORT.md`](docs/PERF_REPORT.md)):

| Metric | Result |
|---|---|
| Search throughput (warm, cache on) | 265 req/s, 0 errors |
| Search p99 latency (warm) | 76 ms |
| Search p95 latency (warm) | 31 ms |
| Effect of the response cache | throughput ~5x, p99 3.35 s to 76 ms |
| Cache hit ratio under load | ~99.8% |

Re-run on TMDB 5000 for a larger catalog-size figure.

## License
MIT, see [LICENSE](LICENSE).
