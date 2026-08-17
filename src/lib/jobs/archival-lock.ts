import { Redis } from "ioredis";
import { env } from "../config/env.ts";

// Dedicated raw-ioredis client (not the generic ICacheProvider — its del()
// is unconditional, no compare-and-delete, so it can't safely release a
// lock only if still held). Same shape as lib/presence/presence-store.ts.
const client = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

client.on("error", (err) => {
  console.error("Archival lock Redis error:", err.message);
});
client.connect().catch((err) => {
  console.error("Archival lock Redis connect error:", err);
});

function lockKey(region: string): string {
  return `archival:${region}:lock`;
}

export async function acquireLock(
  region: string,
  token: string,
  ttlSec: number,
): Promise<boolean> {
  const result = await client.set(
    lockKey(region),
    token,
    "PX",
    ttlSec * 1000,
    "NX",
  );
  return result === "OK";
}

// Only extends the TTL if `token` is still the current holder — a run whose
// TTL already lapsed and got replaced by a newer run's lock must not have
// its stale renew call extend that newer run's lock.
const RENEW_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;

export async function renewLock(
  region: string,
  token: string,
  ttlSec: number,
): Promise<boolean> {
  const result = await client.eval(
    RENEW_SCRIPT,
    1,
    lockKey(region),
    token,
    String(ttlSec * 1000),
  );
  return result === 1;
}

// Only deletes if `token` is still the current holder — the standard safe
// GET-compare-then-DEL pattern, avoiding releasing a lock a later run holds.
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

export async function releaseLock(
  region: string,
  token: string,
): Promise<boolean> {
  const result = await client.eval(RELEASE_SCRIPT, 1, lockKey(region), token);
  return result === 1;
}
