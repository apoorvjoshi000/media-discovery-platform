# 🎬 Media-Discovery Platform

A movie/show **discovery** platform whose headline feature is **search that
understands meaning** (*"feel-good space movie with a female lead"*) plus a
**recommender** that adapts to watch history — built as **observable,
event-driven microservices**, not a monolith CRUD app.

[![CI](https://github.com/USERNAME/media-discovery-platform/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)
![license](https://img.shields.io/badge/license-MIT-blue)
![stack](https://img.shields.io/badge/stack-Next.js%20%C2%B7%20Node%20%C2%B7%20FastAPI%20%C2%B7%20Kafka%20%C2%B7%20Qdrant-6ea8fe)

> **Status:** runnable end-to-end via Docker Compose. The metrics in the CV
> bullets below are intentionally left as `[ ]` until measured from a real run
> — see [`docs/PERF_REPORT.md`](docs/PERF_REPORT.md).

---

## What it does
- **Semantic search** over plot embeddings (`all-MiniLM-L6-v2`, 384-d) in a
  **Qdrant** HNSW index.
- **Hybrid search** = keyword (Mongo text) + vector, fused with **Reciprocal
  Rank Fusion**.
- **Recommender**: item-item collaborative filtering ("more like this") + a
  personalised "for you" row, with **real-time trending** driven by a Kafka
  event stream.
- **API gateway**: JWT auth (+ refresh cookies, RBAC), **token-bucket rate
  limiting** (atomic Redis Lua), and a response **cache** with single-flight
  stampede protection.
- **Observability**: Prometheus metrics + Grafana dashboard on every service,
  and **distributed tracing** (OpenTelemetry → Jaeger) across gateway → search
  → catalog.

## Architecture
See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full diagram and data
flows. Five services (Next.js web · Node gateway/catalog/recommender · FastAPI
search) over MongoDB, Qdrant, Redis, and Kafka.

## Tech stack
| Layer | Tech |
|---|---|
| Frontend | Next.js (App Router, TypeScript), TailwindCSS |
| Services | Node.js + Express (gateway, catalog, recommender), Python + FastAPI (search) |
| Data | MongoDB, Qdrant (vectors), Redis (cache + rate-limit) |
| Streaming | Apache Kafka (KRaft, single node) |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` |
| Observability | Prometheus, Grafana, OpenTelemetry, Jaeger |
| Testing / load | Vitest, pytest, k6 |
| Infra | Docker Compose, GitHub Actions CI |

---

## Quickstart
Requires Docker + Docker Compose.

```bash
cp .env.example .env            # adjust secrets if you like
make up                         # build + start everything (first run pulls the model)
make seed                       # ingest catalog + build embeddings + demo data
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
or `hybrid` mode and compare against `keyword`.

### Without `make`
```bash
docker compose up --build -d
docker compose exec catalog npm run ingest
docker compose exec search python ingest_embeddings.py
```

### Load & chaos test
```bash
k6 run loadtest/search.js          # see loadtest/README.md for the chaos drill
```

### Run the bigger dataset (TMDB 5000)
Drop `tmdb_5000_movies.csv` into `data/`, then:
```bash
docker compose exec catalog npm run ingest -- --dataset data/tmdb_5000_movies.csv
docker compose exec search python ingest_embeddings.py --dataset data/tmdb_5000_movies.csv
```

---

## Tests
```bash
make test            # all services
make test-gateway    # token-bucket + JWT logic
make test-search     # RRF fusion
make test-recommender # item-item CF
```
CI runs typecheck + unit tests + image builds on every push
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Repo layout
```
services/
  gateway/      Node — auth, rate limit, routing, cache, metrics
  catalog/      Node — movie CRUD, Mongo text search, Kafka producer
  search/       FastAPI — embeddings, Qdrant ANN, hybrid RRF
  recommender/  Node — item-item CF, trending, Kafka consumer
web/            Next.js frontend
infra/          Prometheus config + Grafana provisioning & dashboard
loadtest/       k6 script + chaos drill
scripts/        seed.sh, smoke.sh
docs/           ARCHITECTURE, API, PERF_REPORT
```

## Deployment
- **Local:** `docker compose up --build` (above).
- **Single EC2:** clone, set `.env`, `docker compose -f docker-compose.yml up -d`,
  put Nginx in front on :80. (A `docker-compose.prod.yml` with Nginx is the next
  step — see roadmap.)
- **Render/Railway:** each service deploys from its own Dockerfile.

---

## CV bullets (fill `[ ]` from `docs/PERF_REPORT.md` after measuring)
- Architected a **5-service** media-discovery platform (Next.js + Node/FastAPI microservices, MongoDB, Qdrant, Redis, Kafka), serving **semantic search over [N]+ titles** at **[X] ms p95**
- Built **hybrid semantic + keyword search** using `all-MiniLM-L6-v2` embeddings in a Qdrant HNSW index with Reciprocal Rank Fusion, lifting relevant-result rate by **[Δ]%** over keyword-only on an offline eval
- Implemented a Redis token-bucket rate-limiting + caching gateway, sustaining **[Z] req/s** at a **[Y]% cache hit ratio**, and instrumented all services with Prometheus/Grafana + OpenTelemetry tracing

## Interview defense
The line-by-line Q&A (HNSW, RRF, token bucket, JWT storage, cache stampede,
cold-start, load-test bottlenecks) lives in the project spec at
`../../output/apoorv_projects/CV1_SDE_SWE/01_microservices_media_platform.md`.

## License
MIT — see [LICENSE](LICENSE).
