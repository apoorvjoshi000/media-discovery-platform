// Standalone, dependency-free CSV utilities for the TMDB 5000 ingest.
// Kept separate from ingest.ts so it can be unit-tested without a DB.
import type { Movie } from "./db.js";

// RFC-4180-ish splitter: respects quotes and embedded commas/newlines.
export function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function parseTmdbCsv(text: string): Movie[] {
  const rows = splitCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);
  const idIdx = col("id");
  const titleIdx = col("title");
  const dateIdx = col("release_date");
  const overviewIdx = col("overview");
  const genresIdx = col("genres");
  const langIdx = col("original_language");
  const voteIdx = col("vote_average");
  const runtimeIdx = col("runtime");

  const out: Movie[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[idIdx]) continue;
    let genres: string[] = [];
    try {
      genres = JSON.parse(r[genresIdx] || "[]").map((g: { name: string }) => g.name);
    } catch {
      /* malformed genres column — skip */
    }
    out.push({
      movieId: Number(r[idIdx]),
      title: r[titleIdx] ?? "",
      year: r[dateIdx] ? Number(r[dateIdx].slice(0, 4)) : 0,
      genres,
      language: r[langIdx] ?? "en",
      overview: r[overviewIdx] ?? "",
      voteAverage: r[voteIdx] ? Number(r[voteIdx]) : undefined,
      runtime: r[runtimeIdx] ? Number(r[runtimeIdx]) : undefined,
    });
  }
  return out;
}
