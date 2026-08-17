import type { Knex } from "knex";
import { env } from "../config/env.ts";

export function hotShardConfig(region: string): Knex.Config {
  const shard = env.regions.shards[region];
  if (!shard) {
    throw new Error(`No hot shard configured for region: ${region}`);
  }

  return {
    client: "pg",
    connection: {
      host: shard.host,
      port: shard.port,
      user: shard.username,
      password: shard.password,
      database: shard.name,
    },
    pool: { max: env.db.poolMax },
    migrations: {
      directory: env.db.migrationDirectory,
      extension: env.db.migrationExtension,
    },
  };
}

export function archiveShardConfig(region: string): Knex.Config {
  const shard = env.regions.archiveShards[region];
  if (!shard) {
    throw new Error(`No archive shard configured for region: ${region}`);
  }

  return {
    client: "pg",
    connection: {
      host: shard.host,
      port: shard.port,
      user: shard.username,
      password: shard.password,
      database: shard.name,
    },
    pool: { max: env.db.poolMax },
    migrations: {
      directory: env.db.migrationDirectory,
      extension: env.db.migrationExtension,
    },
  };
}
