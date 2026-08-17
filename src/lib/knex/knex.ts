import knex, { Knex } from "knex";
import pg from "pg";
import { REGIONS } from "../sharding/regions.ts";
import { hotShardConfig, archiveShardConfig } from "./shards.ts";

// Postgres sessions run on Etc/UTC (see lib/knex/shards.ts), but node-postgres's
// default parser for `timestamp without time zone` (oid 1114) constructs the
// JS Date using the *local process* timezone, not UTC. On a host whose local
// timezone isn't UTC, every timestamp read back silently drifts by the offset
// (e.g. business logic comparing Date.now() - order.createdAt.getTime() would
// be wrong by that many hours). Force UTC interpretation globally.
pg.types.setTypeParser(1114, (value: string) => new Date(`${value}Z`));

const hotConnections = new Map<string, Knex>();
const archiveConnections = new Map<string, Knex>();

export function db(region: string): Knex {
  let conn = hotConnections.get(region);
  if (!conn) {
    conn = knex(hotShardConfig(region));
    hotConnections.set(region, conn);
  }
  return conn;
}

export function dbArchive(region: string): Knex {
  let conn = archiveConnections.get(region);
  if (!conn) {
    conn = knex(archiveShardConfig(region));
    archiveConnections.set(region, conn);
  }
  return conn;
}

export async function pingAll(): Promise<void> {
  await Promise.all(REGIONS.map((region) => db(region).raw("SELECT 1")));
}

export async function destroyAll(): Promise<void> {
  await Promise.all(
    [...hotConnections.values(), ...archiveConnections.values()].map((conn) =>
      conn.destroy(),
    ),
  );
}
