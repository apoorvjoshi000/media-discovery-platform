# API reference (gateway)

Base URL: `http://localhost:8080`. All bodies are JSON. Authenticated routes
expect `Authorization: Bearer <accessToken>`.

## Auth
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/signup` | `{email, password}` | First user becomes `admin` |
| POST | `/api/auth/login` | `{email, password}` | Returns `{accessToken}`; sets httpOnly refresh cookie |
| POST | `/api/auth/refresh` | — | Uses refresh cookie → new access token |
| POST | `/api/auth/logout` | — | Clears refresh cookie |

## Catalog
| Method | Path | Notes |
|---|---|---|
| GET | `/api/movies?genre=&year=&language=&q=&limit=&skip=` | Browse + filter; `q` = Mongo text search. Cached 30s |
| GET | `/api/movies/:id` | Single movie. Cached 60s |
| PUT | `/api/movies/:id` | Admin upsert (role `admin`) |
| POST | `/api/interactions` | `{type: view\|click\|play, movieId}` → emits to Kafka. Auth required |

## Search
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/search/semantic` | `{query, limit, ef?}` | Vector ANN over Qdrant |
| POST | `/api/search/keyword` | `{query, limit}` | Mongo text via catalog |
| POST | `/api/search/hybrid` | `{query, limit, ef?}` | RRF of keyword + vector. Cached 60s |

`ef` exposes the HNSW `ef_search` recall/latency knob (higher = more recall, slower).

## Recommender
| Method | Path | Notes |
|---|---|---|
| GET | `/api/recommend/similar/:id?n=` | "More like this" (item-item CF) |
| GET | `/api/recommend/foryou?n=` | Personalised (auth); cold-start → trending |
| GET | `/api/trending?n=` | Real-time decayed trending. Cached 10s |

## Platform
| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness (on every service) |
| GET | `/metrics` | Prometheus exposition (on every service) |

## Example
```bash
# semantic search
curl -X POST http://localhost:8080/api/search/semantic \
  -H 'content-type: application/json' \
  -d '{"query":"feel-good space movie with a female lead","limit":5}'
```
