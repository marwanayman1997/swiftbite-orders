import crypto from "crypto";
import { Knex } from "knex";

export interface StoredIdempotencyResult {
  responseStatus: number;
  responseBody: unknown;
}

function hashKey(method: string, path: string, key: string): Buffer {
  return crypto
    .createHash("sha256")
    .update(`${method}:${path}:${key}`)
    .digest();
}

function hashBody(body: unknown): Buffer {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(body ?? {}))
    .digest();
}

// Durable fallback for POST /orders and POST /payments/init when Redis is
// unavailable — Redis remains the hot path; this table is the source of
// truth only on a cache miss caused by a Redis outage.
export async function tryGet(
  conn: Knex,
  method: string,
  path: string,
  key: string,
  requestBody: unknown,
): Promise<StoredIdempotencyResult | "conflict" | null> {
  const keyHash = hashKey(method, path, key);
  const row = await conn("idempotency_keys")
    .where({ key_hash: keyHash })
    .first();
  if (!row) return null;

  const fingerprint = hashBody(requestBody);
  if (!fingerprint.equals(row.request_fingerprint)) {
    return "conflict";
  }
  return {
    responseStatus: row.response_status,
    responseBody: row.response_body,
  };
}

export interface StoreIdempotencyInput {
  region: string;
  userId: number;
  method: string;
  path: string;
  key: string;
  requestBody: unknown;
  responseStatus: number;
  responseBody: unknown;
  ttlSeconds: number;
}

export async function store(
  conn: Knex,
  data: StoreIdempotencyInput,
): Promise<void> {
  const keyHash = hashKey(data.method, data.path, data.key);
  const fingerprint = hashBody(data.requestBody);
  await conn("idempotency_keys")
    .insert({
      key_hash: keyHash,
      region: data.region,
      user_id: data.userId,
      request_fingerprint: fingerprint,
      response_status: data.responseStatus,
      response_body: JSON.stringify(data.responseBody),
      expires_at: new Date(Date.now() + data.ttlSeconds * 1000).toISOString(),
    })
    .onConflict("key_hash")
    .ignore();
}
