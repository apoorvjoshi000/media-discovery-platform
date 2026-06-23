// Mongo persistence for interaction events. Persisting the stream lets the
// item-item model survive restarts and lets the offline rebuild read history.
import { MongoClient, Db, Collection } from "mongodb";
import { logger } from "./logger.js";

export interface EventDoc {
  type: "view" | "click" | "play";
  userId: string;
  movieId: number;
  ts: number;
}

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connect(uri = process.env.MONGO_URI ?? "mongodb://localhost:27017/media"): Promise<Db> {
  if (db) return db;
  client = new MongoClient(uri, { maxPoolSize: 20 });
  await client.connect();
  db = client.db();
  await db.collection<EventDoc>("events").createIndex({ userId: 1 });
  await db.collection<EventDoc>("events").createIndex({ movieId: 1 });
  logger.info("recommender connected to MongoDB");
  return db;
}

export function events(): Collection<EventDoc> {
  if (!db) throw new Error("DB not connected");
  return db.collection<EventDoc>("events");
}

export async function close(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}
