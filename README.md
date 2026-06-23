# Media-Discovery Platform

A movie/show **discovery** platform whose headline feature is **search that
understands meaning** (for example *"feel-good space movie with a female lead"*)
plus a **recommender** that adapts to watch history. It is built as a set of
**observable, event-driven microservices**, not a monolith CRUD app.

[![CI](https://github.com/USERNAME/media-discovery-platform/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)
![license](https://img.shields.io/badge/license-MIT-blue)
![stack](https://img.shields.io/badge/stack-FastAPI%20%C2%B7%20Qdrant%20%C2%B7%20Kafka%20%C2%B7%20Next.js-6ea8fe)

> **Status:** runs end-to-end via Docker Compose. The whole backend is Python
> (FastAPI); the frontend is a thin Next.js client. Measured numbers from a real
> local run are recorded in [`docs/PERF_REPORT.md`](docs/PERF_REPORT.md).

---

## The problem it solves
Keyword search fails the way people actually look for things to watch. Searching
*"hopeful science fiction about saving earth"* against a plain text index returns
nothing useful unless those exact words appear in the plot. This platform indexes
the **meaning** of every plot as a vector, so a query is matched by semantics, not
string overlap, and then **fuses** that with keyword search so exact-match queries
still work. On top of that sits a recommender and a real-time trending feed driven
by a streamed event log, all behind an authenticated, rate-limited, observable
gateway.

## What it does
- **Semantic search** over plot embeddings (`all-MiniLM-L6-v2`, 384-d) in a
  **Qdrant** HNSW index.
- **Hybrid search** = keyword (Mongo text) + vector, fused with **Reciprocal
  Rank Fusion**.
- **Recommender**: item-item collaborative filtering ("more like this") plus a
  personalised "for you" row, with **real-time trending** driven by a Kafka
  event stream and a time-decay window.
- **API gateway**: JWT auth (short-lived access token + httpOnly refresh cookie,
  RBAC), **token-bucket rate limiting** (atomic Redis Lua), and a response
  **cache**.
- **Observability**: Prometheus metrics on every service, a Grafana dashboard,
  and **distributed tracing** (OpenTelemetry to Jaeger) across
  gateway, search, and catalog.

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

Everything an interviewer will ask about (HNSW, RRF, the token bucket, JWT
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

## CV bullets (numbers measured, see `docs/PERF_REPORT.md`)
- Architected a **4-service** media-discovery backend in **Python/FastAPI** (plus a Next.js client) over MongoDB, Qdrant, Redis, and Kafka, serving **semantic search** at **31 ms p95** warm and **265 req/s** through the gateway (k6, 4 vCPU)
- Built **hybrid semantic + keyword search** using `all-MiniLM-L6-v2` embeddings in a Qdrant HNSW index fused with Reciprocal Rank Fusion, so meaning-based queries (for example "hopeful sci-fi about saving earth") return relevant titles that keyword search misses
- Implemented a Redis token-bucket rate limiter (atomic Lua) + response cache that **raised throughput ~5x (54 to 265 req/s)** and cut **p99 from 3.35 s to 76 ms**, and instrumented every service with Prometheus/Grafana + OpenTelemetry tracing

> The throughput/latency figures come from a 4-vCPU local run on the 16-title
> sample. Re-run on TMDB 5000 for a headline catalog-size number.

## Interview defense
The line-by-line Q&A (HNSW, RRF, token bucket, JWT storage, cache stampede,
cold-start, load-test bottlenecks) lives in the project spec at
`../../output/apoorv_projects/CV1_SDE_SWE/01_microservices_media_platform.md`.

## License
MIT, see [LICENSE](LICENSE).
