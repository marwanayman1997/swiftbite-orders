import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE idempotency_keys (
        key_hash        BYTEA PRIMARY KEY,
        region          TEXT NOT NULL,
        user_id         BIGINT NOT NULL,
        request_fingerprint BYTEA NOT NULL,
        response_status INT NOT NULL,
        response_body   JSONB NOT NULL,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at      TIMESTAMP NOT NULL
    );

    -- supports cleanup
    CREATE INDEX idx_idempotency_keys_expires_at ON idempotency_keys (expires_at);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS idempotency_keys;`);
}
