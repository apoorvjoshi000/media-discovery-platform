// Catalog REST routes: browse + filter, fetch one, admin upsert, and the
// interaction endpoint that fans events out to Kafka.
import { Router, Request, Response } from "express";
import { z } from "zod";
import { movies, Movie } from "./db.js";
import { emit, InteractionType } from "./events.js";

export const router = Router();

const listQuery = z.object({
  genre: z.string().optional(),
  year: z.coerce.number().int().optional(),
  language: z.string().optional(),
  q: z.string().optional(), // keyword text search
  limit: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
});

// GET /movies — browse with filters + Mongo text search fallback.
router.get("/movies", async (req: Request, res: Response) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { genre, year, language, q, limit, skip } = parsed.data;

  const filter: Record<string, unknown> = {};
  if (genre) filter.genres = genre;
  if (year) filter.year = year;
  if (language) filter.language = language;
  if (q) filter.$text = { $search: q };

  const projection = q ? { score: { $meta: "textScore" } } : {};
  const sort = q ? { score: { $meta: "textScore" } } : { voteAverage: -1 };

  const cursor = movies()
    .find(filter, { projection })
    .sort(sort as any)
    .skip(skip)
    .limit(limit);
  const [items, total] = await Promise.all([cursor.toArray(), movies().countDocuments(filter)]);
  res.json({ total, limit, skip, items });
});

// GET /movies/:id
router.get("/movies/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  const movie = await movies().findOne({ movieId: id });
  if (!movie) return res.status(404).json({ error: "not found" });
  res.json(movie);
});

// POST /movies/:id/batch — fetch many by id (used by search/recommender to
// hydrate ranked id lists into full movie objects in one round-trip).
const batchBody = z.object({ ids: z.array(z.number()).max(200) });
router.post("/movies/batch", async (req: Request, res: Response) => {
  const parsed = batchBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const docs = await movies().find({ movieId: { $in: parsed.data.ids } }).toArray();
  // Preserve the caller's ranking order.
  const byId = new Map(docs.map((d) => [d.movieId, d]));
  res.json({ items: parsed.data.ids.map((id) => byId.get(id)).filter(Boolean) });
});

// PUT /movies/:id — admin upsert (gateway enforces the admin role).
const movieBody = z.object({
  movieId: z.number(),
  title: z.string(),
  year: z.number(),
  genres: z.array(z.string()),
  language: z.string(),
  overview: z.string(),
  posterPath: z.string().optional(),
  voteAverage: z.number().optional(),
  runtime: z.number().optional(),
});
router.put("/movies/:id", async (req: Request, res: Response) => {
  const parsed = movieBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const movie = parsed.data as Movie;
  await movies().updateOne({ movieId: movie.movieId }, { $set: movie }, { upsert: true });
  res.status(200).json(movie);
});

// POST /interactions — record a view/click/play and emit it to Kafka.
const interactionBody = z.object({
  type: z.enum(["view", "click", "play"]),
  userId: z.string(),
  movieId: z.number(),
});
router.post("/interactions", async (req: Request, res: Response) => {
  const parsed = interactionBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { type, userId, movieId } = parsed.data;
  const delivered = await emit({ type: type as InteractionType, userId, movieId, ts: Date.now() });
  // 202: accepted even if Kafka is down (event dropped) — never block the user.
  res.status(202).json({ accepted: true, delivered });
});
