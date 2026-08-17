import { Knex } from "knex";

export interface RecordWebhookEventInput {
  region: string;
  providerId: number;
  providerEventId: string;
  signature: string;
  payload: unknown;
}

// INSERT ... ON CONFLICT DO NOTHING is the dedupe mechanism — returns the
// number of rows actually inserted (0 means this event was already recorded).
export async function recordWebhookEventIfNew(
  conn: Knex,
  data: RecordWebhookEventInput,
): Promise<{ id: number } | null> {
  const rows = await conn("payment_webhook_events")
    .insert({
      region: data.region,
      provider_id: data.providerId,
      provider_event_id: data.providerEventId,
      signature: data.signature,
      payload: JSON.stringify(data.payload),
    })
    .onConflict(["provider_id", "provider_event_id"])
    .ignore()
    .returning(["id"]);

  return rows.length > 0 ? { id: Number(rows[0].id) } : null;
}

export async function markWebhookEventProcessed(
  conn: Knex,
  id: number,
  processError: string | null,
): Promise<void> {
  await conn("payment_webhook_events").where("id", id).update({
    processed_at: new Date().toISOString(),
    process_error: processError,
  });
}
