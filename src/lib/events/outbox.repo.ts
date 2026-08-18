import { Knex } from "knex";

export interface OutboxEventInput {
  aggregateType: string;
  aggregateId: number;
  eventType: string;
  eventId: string;
  payload: object;
}

export interface OutboxEvent {
  id: number;
  aggregateType: string;
  aggregateId: number;
  eventType: string;
  eventId: string;
  payload: unknown;
  createdAt: Date;
  attempts: number;
}

function toEntity(row: any): OutboxEvent {
  return {
    id: Number(row.id),
    aggregateType: row.aggregate_type,
    aggregateId: Number(row.aggregate_id),
    eventType: row.event_type,
    eventId: row.event_id,
    payload: row.payload,
    createdAt: row.created_at,
    attempts: row.attempts,
  };
}

// Caller owns the trx (the shard it's already on) and inserts this alongside
// the domain mutation it accompanies — see order.service.ts / delivery.service.ts
// / kashier-webhook.service.ts for the call sites.
export async function insertOutboxEvent(
  trx: Knex,
  data: OutboxEventInput,
): Promise<void> {
  await trx("events_outbox").insert({
    aggregate_type: data.aggregateType,
    aggregate_id: data.aggregateId,
    event_type: data.eventType,
    event_id: data.eventId,
    payload: JSON.stringify(data.payload),
  });
}

export async function claimUndispatchedBatch(
  trx: Knex,
  batchSize: number,
): Promise<OutboxEvent[]> {
  const rows = await trx("events_outbox")
    .whereNull("dispatched_at")
    .orderBy("created_at", "asc")
    .limit(batchSize)
    .forUpdate()
    .skipLocked();
  return rows.map(toEntity);
}

// Bulk variant — all dispatched events in a drain batch get the identical
// dispatched_at, so they're marked in one UPDATE instead of one per event.
export async function markOutboxEventsDispatched(
  trx: Knex,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  await trx("events_outbox")
    .whereIn("id", ids)
    .update({ dispatched_at: new Date() });
}

export async function markOutboxEventFailed(
  trx: Knex,
  id: number,
  error: string,
): Promise<void> {
  await trx("events_outbox")
    .where({ id })
    .update({ attempts: trx.raw("attempts + 1"), last_error: error });
}
