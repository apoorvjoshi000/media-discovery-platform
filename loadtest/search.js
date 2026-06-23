// k6 load test for the search hot path through the gateway.
//   k6 run --vus 100 --duration 60s loadtest/search.js
// Override the target with -e BASE=http://<host>:8080
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE = __ENV.BASE || "http://localhost:8080";

const searchLatency = new Trend("search_latency_ms", true);
const errorRate = new Rate("errors");

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "15s", target: 50 },
        { duration: "30s", target: 100 },
        { duration: "15s", target: 0 },
      ],
    },
  },
  thresholds: {
    // The headline SLO: p99 under 300 ms, error rate under 1%.
    "http_req_duration{kind:search}": ["p(99)<300"],
    errors: ["rate<0.01"],
  },
};

const QUERIES = [
  "feel-good space adventure with a female lead",
  "gritty heist in a neon city",
  "slow romance told through letters",
  "hopeful science fiction about saving earth",
  "comedy about a hospital night shift",
];
const MODES = ["hybrid", "semantic", "keyword"];

export default function () {
  const query = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const mode = MODES[Math.floor(Math.random() * MODES.length)];

  const res = http.post(
    `${BASE}/api/search/${mode}`,
    JSON.stringify({ query, limit: 12 }),
    { headers: { "Content-Type": "application/json" }, tags: { kind: "search" } }
  );

  searchLatency.add(res.timings.duration);
  const ok = check(res, {
    "status is 200": (r) => r.status === 200,
    "has items": (r) => {
      try {
        return Array.isArray(r.json("items"));
      } catch {
        return false;
      }
    },
  });
  errorRate.add(!ok);
  sleep(0.2);
}
