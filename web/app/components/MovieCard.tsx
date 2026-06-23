import Link from "next/link";
import type { Movie } from "../lib/api";

export function MovieCard({ movie }: { movie: Movie }) {
  return (
    <Link
      href={`/movie/${movie.movieId}`}
      className="block rounded-xl border border-white/10 bg-panel p-4 transition hover:border-accent/60"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-tight">{movie.title}</h3>
        <span className="shrink-0 text-xs text-slate-400">{movie.year || ""}</span>
      </div>
      <p className="mt-2 line-clamp-3 text-sm text-slate-300">{movie.overview}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
        {movie.genres?.slice(0, 3).map((g) => (
          <span key={g} className="rounded-full bg-white/5 px-2 py-0.5">
            {g}
          </span>
        ))}
        {movie.voteAverage ? <span className="ml-auto">★ {movie.voteAverage.toFixed(1)}</span> : null}
      </div>
      {typeof movie.score === "number" && (
        <div className="mt-2 text-[11px] text-accent/80">match {movie.score.toFixed(3)}</div>
      )}
    </Link>
  );
}
