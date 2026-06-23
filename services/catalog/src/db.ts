// MongoDB connection + the movies collection accessor.
import { MongoClient, Db, Collection } from "mongodb";
import { logger } from "./logger.js";

export interface Movie {
  movieId: number;
  title: string;
  year: number;
  genres: string[];
  language: string;
  overview: string;
  posterPath?: string;
  voteAverage?: number;
  runtime?: number;
}

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connect(uri = process.env.MONGO_URI ?? "mongodb://localhost:27017/media"): Promise<Db> {
  if (db) return db;
  // maxPoolSize fixes the connection-exhaustion bottleneck found under k6 load
  // (see docs/PERF_REPORT.md). Without pooling, p99 collapses past ~80 RPS.
  client = new MongoClient(uri, { maxPoolSize: 50, minPoolSize: 5 });
  await client.connect();
  db = client.db();
  await ensureIndexes(db);
  logger.info({ uri }, "connected to MongoDB");
  return db;
}

async function ensureIndexes(database: Db): Promise<void> {
  const movies = database.collection<Movie>("movies");
  await movies.createIndex({ movieId: 1 }, { unique: true });
  // Text index powers the keyword-search fallback path.
  await movies.createIndex({ title: "text", overview: "text" });
  await movies.createIndex({ genres: 1 });
  await movies.createIndex({ year: 1 });
}

export function movies(): Collection<Movie> {
  if (!db) throw new Error("DB not connected - call connect() first");
  return db.collection<Movie>("movies");
}

export async function close(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}
