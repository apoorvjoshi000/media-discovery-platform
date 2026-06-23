# Load & chaos testing

## Load test (k6)
```bash
# Drive the search hot path through the gateway
k6 run loadtest/search.js
# or against a deployed host
k6 run -e BASE=http://<ec2-ip>:8080 loadtest/search.js
```
Thresholds enforce **p99 < 300 ms** and **error rate < 1%**. The run prints the
sustained RPS; record it in `docs/PERF_REPORT.md`.

## Chaos test (graceful degradation)
While a load test is running, kill a single service and confirm the system
degrades instead of cascading:
```bash
# 1. start load
k6 run --vus 100 --duration 90s loadtest/search.js &
# 2. mid-run, kill the search service
docker compose kill search
# 3. observe: gateway returns 502 for /api/search/* but /api/movies still 200,
#    rate-limit + auth keep working, and no other service crashes.
# 4. bring it back
docker compose up -d search
```
The gateway's per-route isolation (a dead upstream → 502 on that route only)
is the property being demonstrated. Capture before/after in Grafana.
