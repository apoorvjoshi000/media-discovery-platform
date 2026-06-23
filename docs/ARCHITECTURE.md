# Architecture

## Request topology
```
                 +--------------+
   Browser  ---> |   web        |  Next.js (App Router)
                 |  :3000       |
                 +------+-------+
                        | REST (JSON over HTTP)
                 +------v-------+
                 |   gateway    |  JWT auth, token-bucket rate limit (Redis Lua),
                 |  :8080       |  response cache (Redis), /metrics, OTel
                 +-+---+----+---+
        +----------+   |    +-----------+
   +----v-----+   +----v-----+    +-----v-------+
   | catalog  |   |  search  |    | recommender |
   |  :8001   |   |  :8002   |    |   :8003     |
   | FastAPI  |   | FastAPI  |    |  FastAPI    |
   +----+-----+   +--+----+--+    +------+------+
        |            |    | HTTP         |
        | Mongo      |    +--------------+ (keyword + hydrate via catalog)
        |            | Qdrant            | Mongo (events) + Kafka consumer
        v            v                   v
     MongoDB      Qdrant            MongoDB
        ^                               ^
        |                               |
        +---- Kafka `interactions` <----+   catalog produces, recommender consumes
                     |
        Prometheus scrapes /metrics on every service -> Grafana
        All services export OTLP traces -> Jaeger
```

## Services
| Service | Lang | Responsibility | Stores |
|---|---|---|---|
| **gateway** | Python/FastAPI | Auth (JWT), rate limiting, routing, response cache, metrics | Redis, Mongo (users) |
| **catalog** | Python/FastAPI | Movie CRUD, filters, keyword (Mongo text), emits interaction events | MongoDB, Kafka (producer) |
| **search** | Python/FastAPI | Semantic (MiniLM to Qdrant), keyword (to catalog), hybrid (RRF) | Qdrant |
| **recommender** | Python/FastAPI | Item-item CF, "for you", real-time trending; consumes events | MongoDB, Kafka (consumer) |
| **web** | Next.js/TS | UI: search, browse, detail, trending, "more like this" | none |

## Why this shape
- **Microservices, deliberately.** The embedding/search service is CPU-heavy and
  scales independently of the CRUD-bound catalog. Trade-off: extra network hops
  and ops surface, mitigated by a shared `/metrics` contract and one gateway.
  At this scale a monolith would be fine; the point is to demonstrate and measure
  the pattern (see the per-hop latency in the perf report).
- **Event-driven core.** Interactions flow through Kafka, so the write path
  (catalog) never blocks on the read-model (recommender). The stream is
  replayable: the recommender rebuilds its item-item model from history on boot.
- **Observable by default.** Every service exposes Prometheus metrics and emits
  OpenTelemetry traces; one trace spans gateway, search, and catalog.
- **All-Python backend.** Four FastAPI services share the same patterns (lifespan
  startup, a metrics middleware, an optional OTel hook), so the whole backend is
  readable and defensible end to end.

## Data flow: a hybrid search
1. `web` sends `POST /api/search/hybrid` to the **gateway**.
2. Gateway authenticates (optional), checks the **rate-limit bucket** in Redis,
   checks the **response cache**; on a miss it forwards to **search**.
3. **search** embeds the query (MiniLM, 384-d), runs **ANN search in Qdrant**,
   and asks **catalog** for the keyword (Mongo text) results.
4. The two ranked lists are fused with **Reciprocal Rank Fusion**; the top ids
   are hydrated to full movies via catalog's batch endpoint and returned.
5. Gateway caches the response (TTL) and returns it.

## Data flow: an interaction to a recommendation
1. User clicks Play, so `web` sends `POST /api/interactions` (gateway to catalog).
2. **catalog** emits a `play` event to the Kafka `interactions` topic.
3. **recommender** consumes the event: persists it to Mongo and updates the
   in-memory **trending** window (time-decayed counts) in real time.
4. On an interval, the recommender **rebuilds the item-item CF model** from the
   full event history; `/recommend/foryou` and `/recommend/similar/{id}` serve
   from it (cold-start users fall back to trending).
