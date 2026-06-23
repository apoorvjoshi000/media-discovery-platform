// One-off ingest job: loads movies into Mongo. Reads the bundled sample
// dataset by default, or a TMDB 5000 CSV when --dataset is passed.
//   npm run ingest                          # sample_movies.json (16 titles)
//   npm run ingest -- --dataset data/tmdb_5000.csv
import { readFileSync } from "node:fs";
import { connect, movies, close, Movie } from "./db.js";
import { parseTmdbCsv } from "./csv.js";
import { logger } from "./logger.js";

function parseArgs(argv: string[]): { dataset?: string } {
  const out: { dataset?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dataset") out.dataset = argv[++i];
  }
  return out;
}

async function main(): Promise<void> {
  const { dataset } = parseArgs(process.argv.slice(2));
  await connect();

  let records: Movie[];
  if (dataset && dataset.endsWith(".csv")) {
    records = parseTmdbCsv(readFileSync(dataset, "utf8")).filter((m) => m.overview);
    logger.info({ dataset, count: records.length }, "parsed TMDB CSV");
  } else {
    const path = dataset ?? new URL("../../../data/sample_movies.json", import.meta.url).pathname;
    records = JSON.parse(readFileSync(path, "utf8"));
    logger.info({ path, count: records.length }, "loaded sample dataset");
  }

  // Bulk upsert keyed on movieId — idempotent, safe to re-run.
  const ops = records.map((m) => ({
    updateOne: { filter: { movieId: m.movieId }, update: { $set: m }, upsert: true },
  }));
  if (ops.length) await movies().bulkWrite(ops, { ordered: false });
  logger.info({ inserted: ops.length }, "ingest complete");
  await close();
}

main().catch((err) => {
  logger.error({ err }, "ingest failed");
  process.exit(1);
});
