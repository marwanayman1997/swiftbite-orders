import { Redis } from "ioredis";
import { env } from "../config/env.ts";

// Dedicated Redis client for agent presence (GEO set + busy set + meta hash).
// Kept separate from pkg/cache's ICacheProvider (a generic get/set/del
// cache-aside abstraction) since presence needs GEO/SET/HASH primitives that
// don't belong on a generic cache interface — see system-design.md §3 Layer D.
const client = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  password: env.redis.password || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

client.on("error", (err) => {
  console.error("Presence Redis Error:", err.message);
});
client.connect().catch((err) => {
  console.error("Presence Redis Connect Error:", err);
});

export interface GeoCandidate {
  agentId: number;
  distanceMeters: number;
}

function geoKey(region: string): string {
  return `presence:geo:${region}`;
}
function busyKey(region: string): string {
  return `presence:busy:${region}`;
}
function metaKey(region: string, agentId: number): string {
  return `presence:meta:${region}:${agentId}`;
}

export async function setAgentOnline(
  region: string,
  agentId: number,
  lat: number,
  lng: number,
): Promise<void> {
  await client.geoadd(geoKey(region), lng, lat, String(agentId));
  await client.hset(
    metaKey(region, agentId),
    "lastSeenAt",
    new Date().toISOString(),
    "online",
    "1",
  );
  // Going online resets state — defensive, agent shouldn't have been busy
  // while offline.
  await client.srem(busyKey(region), String(agentId));
}

export async function setAgentOffline(
  region: string,
  agentId: number,
): Promise<void> {
  await client.zrem(geoKey(region), String(agentId));
  await client.srem(busyKey(region), String(agentId));
  await client.hset(metaKey(region, agentId), "online", "0");
}

export async function pingAgent(
  region: string,
  agentId: number,
  lat: number,
  lng: number,
): Promise<void> {
  await client.geoadd(geoKey(region), lng, lat, String(agentId));
  await client.hset(
    metaKey(region, agentId),
    "lastSeenAt",
    new Date().toISOString(),
  );
}

export async function markAgentBusy(
  region: string,
  agentId: number,
): Promise<void> {
  await client.sadd(busyKey(region), String(agentId));
}

export async function markAgentFree(
  region: string,
  agentId: number,
): Promise<void> {
  await client.srem(busyKey(region), String(agentId));
}

export async function isAgentBusy(
  region: string,
  agentId: number,
): Promise<boolean> {
  const result = await client.sismember(busyKey(region), String(agentId));
  return result === 1;
}

// Nearest online, non-busy agents within radiusMeters of the pickup point.
// Empty array (not an error) if the geo set is cold/empty — the caller
// falls back to the Postgres GIST scan in that case.
export async function findNearbyOnlineAgents(
  region: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  limit: number,
): Promise<GeoCandidate[]> {
  const busy = new Set(await client.smembers(busyKey(region)));

  // Over-fetch so filtering out busy agents still leaves up to `limit` results.
  const raw = (await client.call(
    "GEOSEARCH",
    geoKey(region),
    "FROMLONLAT",
    String(lng),
    String(lat),
    "BYRADIUS",
    String(radiusMeters),
    "m",
    "ASC",
    "COUNT",
    String(limit + busy.size),
    "WITHDIST",
  )) as Array<[string, string]>;

  const candidates: GeoCandidate[] = [];
  for (const [agentIdStr, distStr] of raw) {
    if (busy.has(agentIdStr)) continue;
    candidates.push({
      agentId: Number(agentIdStr),
      distanceMeters: Number(distStr),
    });
    if (candidates.length >= limit) break;
  }
  return candidates;
}
