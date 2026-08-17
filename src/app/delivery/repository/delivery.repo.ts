import { Knex } from "knex";
import { DeliveryEntity } from "../entity/delivery.entity.ts";
import { DeliveryStatus } from "../enums.ts";
import {
  applyCursorPagination,
  buildPaginationResult,
  PaginationMeta,
  PaginationParams,
} from "../../../lib/http/pagination/cursor-pagination.ts";

const DELIVERY_COLUMNS = [
  "id",
  "region",
  "order_id",
  "agent_id",
  "status",
  "pickup_lat",
  "pickup_lng",
  "dropoff_lat",
  "dropoff_lng",
  "distance_meters",
  "earning_amount",
  "currency",
  "assigned_at",
  "accepted_at",
  "rejected_at",
  "picked_at",
  "delivered_at",
  "reassigned_at",
  "reassigned_from",
];

function toEntity(row: any): DeliveryEntity {
  return new DeliveryEntity({
    id: Number(row.id),
    region: row.region,
    orderId: Number(row.order_id),
    agentId: Number(row.agent_id),
    status: row.status,
    pickupLat: Number(row.pickup_lat),
    pickupLng: Number(row.pickup_lng),
    dropoffLat: Number(row.dropoff_lat),
    dropoffLng: Number(row.dropoff_lng),
    distanceMeters:
      row.distance_meters !== null ? Number(row.distance_meters) : null,
    earningAmount:
      row.earning_amount !== null ? Number(row.earning_amount) : null,
    currency: row.currency,
    assignedAt: row.assigned_at,
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
    pickedAt: row.picked_at,
    deliveredAt: row.delivered_at,
    reassignedAt: row.reassigned_at,
    reassignedFrom:
      row.reassigned_from !== null ? Number(row.reassigned_from) : null,
  });
}

const ACTIVE_STATUSES = [
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.ACCEPTED,
  DeliveryStatus.PICKED,
];

export interface CreateDeliveryInput {
  region: string;
  orderId: number;
  agentId: number;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  distanceMeters: number | null;
  currency: string;
  reassignedFrom?: number | null;
}

export async function createDelivery(
  conn: Knex,
  data: CreateDeliveryInput,
): Promise<DeliveryEntity> {
  const [row] = await conn("deliveries")
    .insert({
      region: data.region,
      order_id: data.orderId,
      agent_id: data.agentId,
      status: DeliveryStatus.ASSIGNED,
      pickup_lat: data.pickupLat,
      pickup_lng: data.pickupLng,
      dropoff_lat: data.dropoffLat,
      dropoff_lng: data.dropoffLng,
      distance_meters:
        data.distanceMeters !== null ? Math.round(data.distanceMeters) : null,
      currency: data.currency,
      reassigned_from: data.reassignedFrom ?? null,
    })
    .returning(DELIVERY_COLUMNS);
  return toEntity(row);
}

export async function findDeliveryById(
  conn: Knex,
  id: number,
): Promise<DeliveryEntity | undefined> {
  const row = await conn("deliveries")
    .select(DELIVERY_COLUMNS)
    .where("id", id)
    .first();
  return row ? toEntity(row) : undefined;
}

export async function findDeliveriesByAgentId(
  conn: Knex,
  agentId: number,
  status: DeliveryStatus | undefined,
  pagination: PaginationParams,
): Promise<{ data: DeliveryEntity[]; meta: PaginationMeta }> {
  let query = conn("deliveries")
    .select(DELIVERY_COLUMNS)
    .where("agent_id", agentId);
  if (status) query = query.where("status", status);
  query = applyCursorPagination(query, pagination, conn);

  const rows = await query;
  const { data, meta } = buildPaginationResult(
    rows,
    pagination.limit,
    pagination.sortBy,
  );
  return { data: data.map(toEntity), meta };
}

export async function findActiveDeliveryByOrderId(
  conn: Knex,
  orderId: number,
): Promise<DeliveryEntity | undefined> {
  const row = await conn("deliveries")
    .select(DELIVERY_COLUMNS)
    .where("order_id", orderId)
    .whereIn("status", ACTIVE_STATUSES)
    .first();
  return row ? toEntity(row) : undefined;
}

export async function findActiveDeliveryByAgentId(
  conn: Knex,
  agentId: number,
): Promise<DeliveryEntity | undefined> {
  const row = await conn("deliveries")
    .select(DELIVERY_COLUMNS)
    .where("agent_id", agentId)
    .whereIn("status", ACTIVE_STATUSES)
    .first();
  return row ? toEntity(row) : undefined;
}

export async function findLatestDeliveryByOrderId(
  conn: Knex,
  orderId: number,
): Promise<DeliveryEntity | undefined> {
  const row = await conn("deliveries")
    .select(DELIVERY_COLUMNS)
    .where("order_id", orderId)
    .orderBy("assigned_at", "desc")
    .first();
  return row ? toEntity(row) : undefined;
}

export async function updateDeliveryStatus(
  conn: Knex,
  id: number,
  status: DeliveryStatus,
): Promise<DeliveryEntity | undefined> {
  const payload: Record<string, unknown> = { status };
  const tsColumn: Partial<Record<DeliveryStatus, string>> = {
    [DeliveryStatus.ACCEPTED]: "accepted_at",
    [DeliveryStatus.REJECTED]: "rejected_at",
    [DeliveryStatus.PICKED]: "picked_at",
    [DeliveryStatus.DELIVERED]: "delivered_at",
    [DeliveryStatus.REASSIGNED]: "reassigned_at",
  };
  const col = tsColumn[status];
  if (col) payload[col] = new Date().toISOString();

  const [row] = await conn("deliveries")
    .where("id", id)
    .update(payload)
    .returning(DELIVERY_COLUMNS);
  return row ? toEntity(row) : undefined;
}

// Returns the freed agent's id (if any) so the caller can also free them in
// the Redis busy set — otherwise they'd be stuck "phantom busy" there.
export async function cancelActiveDeliveryForOrder(
  conn: Knex,
  orderId: number,
): Promise<number | undefined> {
  const [row] = await conn("deliveries")
    .where("order_id", orderId)
    .whereIn("status", ACTIVE_STATUSES)
    .update({ status: DeliveryStatus.CANCELLED })
    .returning(["agent_id"]);
  return row ? Number(row.agent_id) : undefined;
}

export async function setDeliveryEarning(
  conn: Knex,
  id: number,
  earningAmount: number,
): Promise<void> {
  await conn("deliveries")
    .where("id", id)
    .update({ earning_amount: earningAmount });
}

// Chain length including the given delivery itself (walks reassigned_from
// pointers back to the original assignment).
export async function countReassignmentChain(
  conn: Knex,
  deliveryId: number,
): Promise<number> {
  let count = 1;
  let currentId: number | null = deliveryId;
  while (currentId !== null) {
    const row: { reassigned_from: number | string | null } | undefined =
      await conn("deliveries")
        .select("reassigned_from")
        .where("id", currentId)
        .first();
    if (!row || row.reassigned_from === null) break;
    currentId = Number(row.reassigned_from);
    count++;
  }
  return count;
}

// Busy check via live query — Phase 4 adds a Redis `presence:busy` fast-path
// cache in front of this same invariant; this is the source of truth.
export async function agentHasActiveDelivery(
  conn: Knex,
  agentId: number,
): Promise<boolean> {
  const row = await conn("deliveries")
    .where("agent_id", agentId)
    .whereIn("status", ACTIVE_STATUSES)
    .first();
  return !!row;
}

export interface CandidateAgent {
  agentId: number;
  distanceMeters: number;
}

// Nearest online, non-busy agents within radiusMeters of the pickup point.
export async function findCandidateAgents(
  conn: Knex,
  lat: number,
  lng: number,
  radiusMeters: number,
  limit: number,
): Promise<CandidateAgent[]> {
  const result = await conn.raw(
    `
    SELECT ap.agent_id, ST_Distance(ap.location, ST_MakePoint(?, ?)::geography) AS distance_meters
    FROM agent_presence ap
    WHERE ap.is_online = TRUE
      AND ap.last_seen_at > NOW() - INTERVAL '90 seconds'
      AND ST_DWithin(ap.location, ST_MakePoint(?, ?)::geography, ?)
      AND NOT EXISTS (
        SELECT 1 FROM deliveries d
        WHERE d.agent_id = ap.agent_id AND d.status IN ('assigned','accepted','picked')
      )
    ORDER BY ap.location <-> ST_MakePoint(?, ?)::geography
    LIMIT ?
    `,
    [lng, lat, lng, lat, radiusMeters, lng, lat, limit],
  );

  return result.rows.map((row: any) => ({
    agentId: Number(row.agent_id),
    distanceMeters: Number(row.distance_meters),
  }));
}
