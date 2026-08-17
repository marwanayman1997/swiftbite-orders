import type { Knex } from "knex";
import { hotShardConfig } from "./shards.ts";

// Used by the knex CLI for a single region at a time:
//   KNEX_REGION=eg npx tsx node_modules/.bin/knex migrate:latest --knexfile src/lib/knex/knexfile.ts
// For running migrations across every configured region at once, use `npm run migrate:all`
// (src/lib/knex/migrate-all.ts), which is the normal workflow for this service.
const region = process.env.KNEX_REGION;

const config: Knex.Config = region ? hotShardConfig(region) : { client: "pg" };

export default config;
