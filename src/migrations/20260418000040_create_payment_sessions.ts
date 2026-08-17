import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE payment_sessions (
        id              BIGSERIAL PRIMARY KEY,
        region          TEXT NOT NULL,
        order_id        BIGINT NOT NULL,
        provider_id     INT NOT NULL,
        provider_session_id TEXT NOT NULL,
        redirect_url    TEXT NOT NULL,
        amount          INT NOT NULL,
        currency        TEXT NOT NULL,
        status          TEXT NOT NULL CHECK (status IN (
                            'initialized','pending','authorized','captured','failed','expired','cancelled'
                        )),
        raw_init_payload  JSONB NOT NULL,
        raw_last_payload  JSONB NULL,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_payment_sessions_order_id FOREIGN KEY (order_id) REFERENCES orders(id),
        CONSTRAINT uq_payment_sessions_provider_session_id UNIQUE (provider_session_id)
    );

    -- supports webhook lookup by Kashier session id
    CREATE INDEX idx_payment_sessions_provider_session_id ON payment_sessions (provider_session_id);
    -- supports order -> session lookup
    CREATE INDEX idx_payment_sessions_order_id ON payment_sessions (order_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS payment_sessions;`);
}
