// Thin client for the gateway API. Base URL is injected at build/runtime via
// NEXT_PUBLIC_GATEWAY_URL so the same image works locally and in the cloud.
export const GATEWAY =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080";

export interface Movie {
  movieId: number;
  title: string;
  year: number;
  genres: string[];
  language: string;
  overview: string;
  voteAverage?: number;
  runtime?: number;
  score?: number;
}

export type SearchMode = "semantic" | "keyword" | "hybrid";

function authHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const t = localStorage.getItem("accessToken");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function search(mode: SearchMode, query: string, limit = 12): Promise<Movie[]> {
  const r = await fetch(`${GATEWAY}/api/search/${mode}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeader() },
    body: JSON.stringify({ query, limit }),
  });
  if (!r.ok) throw new Error(`search failed (${r.status})`);
  return (await r.json()).items;
}

export async function browse(params: Record<string, string | number> = {}): Promise<Movie[]> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const r = await fetch(`${GATEWAY}/api/movies?${qs}`, { headers: authHeader() });
  if (!r.ok) throw new Error(`browse failed (${r.status})`);
  return (await r.json()).items;
}

export async function getMovie(id: number): Promise<Movie> {
  const r = await fetch(`${GATEWAY}/api/movies/${id}`, { headers: authHeader() });
  if (!r.ok) throw new Error(`movie ${id} not found`);
  return r.json();
}

export async function trending(): Promise<Movie[]> {
  const r = await fetch(`${GATEWAY}/api/trending`, { headers: authHeader() });
  if (!r.ok) return [];
  return (await r.json()).items;
}

export async function similar(id: number): Promise<Movie[]> {
  const r = await fetch(`${GATEWAY}/api/recommend/similar/${id}`, { headers: authHeader() });
  if (!r.ok) return [];
  return (await r.json()).items;
}

export async function logInteraction(type: "view" | "click" | "play", movieId: number): Promise<void> {
  // Best-effort; requires auth. Drives trending + the recommender.
  await fetch(`${GATEWAY}/api/interactions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeader() },
    body: JSON.stringify({ type, movieId }),
  }).catch(() => {});
}

export async function login(email: string, password: string): Promise<void> {
  const r = await fetch(`${GATEWAY}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error("login failed");
  const { accessToken } = await r.json();
  localStorage.setItem("accessToken", accessToken);
}

export async function signup(email: string, password: string): Promise<void> {
  const r = await fetch(`${GATEWAY}/api/auth/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok && r.status !== 409) throw new Error("signup failed");
}
