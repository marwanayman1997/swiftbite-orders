import pg from "pg";
import { env } from "../src/lib/config/env.ts";

// A knex migration runs against an already-open connection to its target
// database — it can't create that database itself. This is a one-off
// prerequisite: connect to each region's hot-shard host (via the
// maintenance `postgres` database) using the hot shard's credentials, and
// create the archive database if it doesn't already exist. Postgres has no
// `CREATE DATABASE IF NOT EXISTS`, hence the existence check first.
async function createArchiveDbs(): Promise<void> {
  for (const region of env.regions.list) {
    const hot = env.regions.shards[region];
    const archive = env.regions.archiveShards[region];
    if (!archive) {
      console.log(
        `[create-archive-dbs] region=${region} skipped (no archive shard configured)`,
      );
      continue;
    }

    const client = new pg.Client({
      host: hot.host,
      port: hot.port,
      user: hot.username,
      password: hot.password,
      database: "postgres",
    });
    await client.connect();
    try {
      const existing = await client.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [archive.name],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        console.log(
          `[create-archive-dbs] region=${region} database=${archive.name} already exists`,
        );
        continue;
      }
      // Database identifiers can't be parameterized — archive.name comes
      // from our own env config, not user input.
      await client.query(`CREATE DATABASE "${archive.name}"`);
      console.log(
        `[create-archive-dbs] region=${region} database=${archive.name} created`,
      );
    } finally {
      await client.end();
    }
  }
}

createArchiveDbs()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[create-archive-dbs] failed:", err);
    process.exit(1);
  });
