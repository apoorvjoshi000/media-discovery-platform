"use client";

import { useEffect, useState } from "react";
import { search, browse, trending, type Movie, type SearchMode } from "./lib/api";
import { MovieCard } from "./components/MovieCard";

const MODES: SearchMode[] = ["hybrid", "semantic", "keyword"];

export default function Home() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("hybrid");
  const [results, setResults] = useState<Movie[]>([]);
  const [trend, setTrend] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    browse({ limit: 12 }).then(setResults).catch(() => {});
    trending().then(setTrend).catch(() => {});
  }, []);

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    const t0 = performance.now();
    try {
      const items = await search(mode, query);
      setResults(items);
      setLatency(Math.round(performance.now() - t0));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <form onSubmit={runSearch} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Try: "feel-good space movie with a female lead"'
            className="flex-1 rounded-lg border border-white/10 bg-panel px-4 py-3 outline-none focus:border-accent"
          />
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as SearchMode)}
            className="rounded-lg border border-white/10 bg-panel px-3 py-3"
          >
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-accent px-5 py-3 font-medium text-ink hover:opacity-90"
          >
            Search
          </button>
        </form>
        <div className="mt-2 text-xs text-slate-400">
          {loading && "searching…"}
          {!loading && latency !== null && `${mode} search · ${latency} ms round-trip`}
          {error && <span className="text-red-400">{error}</span>}
        </div>
      </section>

      {trend.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Trending now
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trend.slice(0, 6).map((m) => (
              <MovieCard key={m.movieId} movie={m} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          {query ? "Results" : "Browse"}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((m) => (
            <MovieCard key={m.movieId} movie={m} />
          ))}
        </div>
        {results.length === 0 && !loading && (
          <p className="text-sm text-slate-400">No results. Try a different query.</p>
        )}
      </section>
    </div>
  );
}
