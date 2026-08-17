import knex from "knex";
import { REGIONS } from "../sharding/regions.ts";
import { archiveShardConfig, hotShardConfig } from "./shards.ts";

const cluster =
  process.argv.find((a) => a.startsWith("--cluster="))?.split("=")[1] ?? "hot";
const configFor = cluster === "archive" ? archiveShardConfig : hotShardConfig;

async function migrateAll(): Promise<void> {
  for (const region of REGIONS) {
    const conn = knex(configFor(region));
    try {
      const [, migrations] = await conn.migrate.latest();
      console.log(
        `[migrate-all] cluster=${cluster} region=${region} applied=${migrations.length}`,
      );
    } finally {
      await conn.destroy();
    }
  }
}

migrateAll()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate-all] failed:", err);
    process.exit(1);
  });
