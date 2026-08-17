import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE payment_webhook_events (
        id              BIGSERIAL PRIMARY KEY,
        region          TEXT NOT NULL,
        provider_id     INT NOT NULL,
        provider_event_id TEXT NOT NULL,
        signature       TEXT NOT NULL,
        payload         JSONB NOT NULL,
        received_at     TIMESTAMP NOT NULL DEFAULT NOW(),
        processed_at    TIMESTAMP NULL,
        process_error   TEXT NULL,

        CONSTRAINT uq_payment_webhook_events_provider_event_id UNIQUE (provider_id, provider_event_id)
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS payment_webhook_events;`);
}
