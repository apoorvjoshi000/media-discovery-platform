"use client";

import { useEffect, useState } from "react";
import { getMovie, similar, logInteraction, type Movie } from "../../lib/api";
import { MovieCard } from "../../components/MovieCard";

export default function MoviePage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [more, setMore] = useState<Movie[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMovie(id)
      .then((m) => {
        setMovie(m);
        logInteraction("view", id); // feeds trending + recommender
      })
      .catch((e) => setError((e as Error).message));
    similar(id).then(setMore).catch(() => {});
  }, [id]);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!movie) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="space-y-8">
      <a href="/" className="text-sm text-accent">
        ← back
      </a>
      <article className="rounded-xl border border-white/10 bg-panel p-6">
        <h1 className="text-2xl font-semibold">
          {movie.title} <span className="text-slate-400">({movie.year})</span>
        </h1>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-300">
          {movie.genres?.map((g) => (
            <span key={g} className="rounded-full bg-white/5 px-2 py-0.5">
              {g}
            </span>
          ))}
          <span className="rounded-full bg-white/5 px-2 py-0.5">{movie.language}</span>
          {movie.runtime ? <span className="rounded-full bg-white/5 px-2 py-0.5">{movie.runtime} min</span> : null}
        </div>
        <p className="mt-4 text-slate-200">{movie.overview}</p>
        <button
          onClick={() => logInteraction("play", id)}
          className="mt-5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-ink"
        >
          ▶ Play (logs a play event)
        </button>
      </article>

      {more.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            More like this
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((m) => (
              <MovieCard key={m.movieId} movie={m} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
