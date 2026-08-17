import { Knex } from "knex";
import { AgentPresenceEntity } from "../entity/agent-presence.entity.ts";

const PRESENCE_COLUMNS = [
  "agent_id",
  "region",
  "is_online",
  "last_lat",
  "last_lng",
  "last_seen_at",
  "updated_at",
];

function toEntity(row: any): AgentPresenceEntity {
  return new AgentPresenceEntity({
    agentId: Number(row.agent_id),
    region: row.region,
    isOnline: row.is_online,
    lastLat: row.last_lat !== null ? Number(row.last_lat) : null,
    lastLng: row.last_lng !== null ? Number(row.last_lng) : null,
    lastSeenAt: row.last_seen_at,
    updatedAt: row.updated_at,
  });
}

// `location` is a GENERATED ALWAYS column derived from last_lat/last_lng —
// never included in insert/update payloads.
export async function upsertAgentOnline(
  conn: Knex,
  agentId: number,
  region: string,
  lat: number,
  lng: number,
): Promise<AgentPresenceEntity> {
  const now = new Date().toISOString();
  const [row] = await conn("agent_presence")
    .insert({
      agent_id: agentId,
      region,
      is_online: true,
      last_lat: lat,
      last_lng: lng,
      last_seen_at: now,
      updated_at: now,
    })
    .onConflict("agent_id")
    .merge({
      is_online: true,
      last_lat: lat,
      last_lng: lng,
      last_seen_at: now,
      updated_at: now,
    })
    .returning(PRESENCE_COLUMNS);
  return toEntity(row);
}

export async function setAgentPresenceOffline(
  conn: Knex,
  agentId: number,
): Promise<void> {
  const now = new Date().toISOString();
  await conn("agent_presence")
    .where("agent_id", agentId)
    .update({ is_online: false, last_seen_at: now, updated_at: now });
}

export async function pingAgentPresence(
  conn: Knex,
  agentId: number,
  lat: number,
  lng: number,
): Promise<void> {
  const now = new Date().toISOString();
  await conn("agent_presence").where("agent_id", agentId).update({
    last_lat: lat,
    last_lng: lng,
    last_seen_at: now,
    updated_at: now,
  });
}

export async function findAgentPresence(
  conn: Knex,
  agentId: number,
): Promise<AgentPresenceEntity | undefined> {
  const row = await conn("agent_presence")
    .select(PRESENCE_COLUMNS)
    .where("agent_id", agentId)
    .first();
  return row ? toEntity(row) : undefined;
}
