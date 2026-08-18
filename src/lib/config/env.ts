import path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.resolve(__dirname, "../../../.env") });

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.string().default("4000"),
  ACCESS_SECRET: z.string(),
  REFRESH_SECRET: z.string(),
  DB_MIGRATION_DIRECTORY: z.string(),
  DB_MIGRATION_EXTENSION: z.string(),
  DB_POOL_MAX: z.string().default("10"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),

  REGIONS: z.string(),

  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.string().default("6379"),
  REDIS_PASSWORD: z.string().default(""),

  RABBITMQ_URL: z.string(),
  RABBITMQ_CORE_EVENTS_EXCHANGE: z.string().default("core.events"),
  RABBITMQ_ORDER_EVENTS_EXCHANGE: z.string().default("order.events"),
  RABBITMQ_CORE_EVENTS_QUEUE: z.string().default("order-service.core-events"),
  RABBITMQ_CORE_EVENTS_BINDINGS: z
    .string()
    .default("product.#,branch.#,restaurant.#,rbac.#"),
  RABBITMQ_CORE_EVENTS_DLX: z.string().default("core.events.dlx"),
  RABBITMQ_CORE_EVENTS_DLQ: z.string().default("order-service.core-events.dlq"),
  RABBITMQ_PREFETCH: z.string().default("32"),

  CORE_SERVICE_BASE_URL: z.string(),
  CORE_INTERNAL_API_KEY: z.string(),
  PUBLIC_BASE_URL: z.string().default("http://localhost:4000"),

  KASHIER_BASE_URL: z.string().default("https://api.kashier.io"),
  KASHIER_MERCHANT_ID: z.string().default(""),
  KASHIER_API_KEY: z.string().default(""),
  KASHIER_SECRET_KEY: z.string().default(""),
  KASHIER_WEBHOOK_SECRET: z.string().default(""),
  KASHIER_RETURN_URL: z.string().default(""),
  KASHIER_FAIL_URL: z.string().default(""),
  PAYMENT_SESSION_TIMEOUT_MIN: z.string().default("15"),

  ASSIGNMENT_RADIUS_METERS: z.string().default("5000"),
  AGENT_ACCEPT_TIMEOUT_SEC: z.string().default("30"),
  MAX_REASSIGNMENT_ATTEMPTS: z.string().default("3"),
  PRESENCE_STALE_SEC: z.string().default("90"),
  AGENT_SHARE_RATE: z.string().default("0.8"),

  WS_HEARTBEAT_SEC: z.string().default("30"),

  ARCHIVAL_MAX_RUNTIME_MIN: z.string().default("60"),
  ARCHIVAL_INTERVAL_MIN: z.string().default("1440"),
  ARCHIVAL_ENABLED: z.string().default("true"),

  OUTBOX_BATCH_SIZE: z.string().default("50"),
  OUTBOX_DRAIN_ENABLED: z.string().default("true"),
  OUTBOX_DRAIN_INTERVAL_MS: z.string().default("2000"),
});

const parsed = schema.parse(process.env);

const regions = parsed.REGIONS.split(",")
  .map((r) => r.trim())
  .filter(Boolean);

if (regions.length === 0) {
  throw new Error("REGIONS must list at least one region code");
}

export interface ShardDbConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
}

export interface ArchiveDbConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  name: string;
}

function readRequired(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

const shardDb: Record<string, ShardDbConfig> = {};
const archiveDb: Record<string, ArchiveDbConfig> = {};

for (const region of regions) {
  const host = readRequired(`DB_${region}_HOST`);
  const port = Number(process.env[`DB_${region}_PORT`] ?? "5432");
  const username = readRequired(`DB_${region}_USERNAME`);
  const password = readRequired(`DB_${region}_PASSWORD`);
  const name = readRequired(`DB_${region}_NAME`);
  shardDb[region] = { host, port, username, password, name };

  const archiveHost = process.env[`ARCHIVE_DB_${region}_HOST`];
  const archiveName = process.env[`ARCHIVE_DB_${region}_NAME`];
  if (archiveHost && archiveName) {
    archiveDb[region] = {
      host: archiveHost,
      port,
      username,
      password,
      name: archiveName,
    };
  }
}

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: Number(parsed.PORT),
  isProduction: process.env.NODE_ENV === "production",
  jwt: {
    accessSecret: parsed.ACCESS_SECRET,
    refreshSecret: parsed.REFRESH_SECRET,
  },
  cors: {
    origins: parsed.CORS_ORIGINS.split(","),
  },
  db: {
    poolMax: Number(parsed.DB_POOL_MAX),
    migrationDirectory: path.resolve(
      __dirname,
      "../../../",
      parsed.DB_MIGRATION_DIRECTORY,
    ),
    migrationExtension: parsed.DB_MIGRATION_EXTENSION,
  },
  regions: {
    list: regions,
    shards: shardDb,
    archiveShards: archiveDb,
  },
  redis: {
    host: parsed.REDIS_HOST,
    port: Number(parsed.REDIS_PORT),
    password: parsed.REDIS_PASSWORD,
  },
  rabbitmq: {
    url: parsed.RABBITMQ_URL,
    coreEventsExchange: parsed.RABBITMQ_CORE_EVENTS_EXCHANGE,
    orderEventsExchange: parsed.RABBITMQ_ORDER_EVENTS_EXCHANGE,
    coreEventsQueue: parsed.RABBITMQ_CORE_EVENTS_QUEUE,
    coreEventsBindings: parsed.RABBITMQ_CORE_EVENTS_BINDINGS.split(",")
      .map((b) => b.trim())
      .filter(Boolean),
    coreEventsDlx: parsed.RABBITMQ_CORE_EVENTS_DLX,
    coreEventsDlq: parsed.RABBITMQ_CORE_EVENTS_DLQ,
    prefetch: Number(parsed.RABBITMQ_PREFETCH),
  },
  core: {
    baseUrl: parsed.CORE_SERVICE_BASE_URL,
    internalApiKey: parsed.CORE_INTERNAL_API_KEY,
  },
  publicBaseUrl: parsed.PUBLIC_BASE_URL,
  kashier: {
    baseUrl: parsed.KASHIER_BASE_URL,
    merchantId: parsed.KASHIER_MERCHANT_ID,
    apiKey: parsed.KASHIER_API_KEY,
    secretKey: parsed.KASHIER_SECRET_KEY,
    webhookSecret: parsed.KASHIER_WEBHOOK_SECRET,
    returnUrl: parsed.KASHIER_RETURN_URL,
    failUrl: parsed.KASHIER_FAIL_URL,
    sessionTimeoutMin: Number(parsed.PAYMENT_SESSION_TIMEOUT_MIN),
  },
  assignment: {
    radiusMeters: Number(parsed.ASSIGNMENT_RADIUS_METERS),
    agentAcceptTimeoutSec: Number(parsed.AGENT_ACCEPT_TIMEOUT_SEC),
    maxReassignmentAttempts: Number(parsed.MAX_REASSIGNMENT_ATTEMPTS),
    presenceStaleSec: Number(parsed.PRESENCE_STALE_SEC),
    agentShareRate: Number(parsed.AGENT_SHARE_RATE),
  },
  ws: {
    heartbeatSec: Number(parsed.WS_HEARTBEAT_SEC),
  },
  archival: {
    maxRuntimeMin: Number(parsed.ARCHIVAL_MAX_RUNTIME_MIN),
    intervalMin: Number(parsed.ARCHIVAL_INTERVAL_MIN),
    enabled: parsed.ARCHIVAL_ENABLED === "true",
  },
  outbox: {
    batchSize: Number(parsed.OUTBOX_BATCH_SIZE),
    drainEnabled: parsed.OUTBOX_DRAIN_ENABLED === "true",
    drainIntervalMs: Number(parsed.OUTBOX_DRAIN_INTERVAL_MS),
  },
};
