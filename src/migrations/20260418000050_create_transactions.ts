import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE transactions (
        id                  BIGSERIAL PRIMARY KEY,
        region              TEXT NOT NULL,
        order_id            BIGINT NULL,
        transaction_type    TEXT NOT NULL CHECK (transaction_type IN (
                                'charge','refund','commission','payout','cod_collection','adjustment'
                            )),
        method              TEXT NOT NULL CHECK (method IN ('online','cod','bank_transfer','system')),
        provider_id         INT NULL,
        provider_reference_id TEXT NULL,
        status              TEXT NOT NULL CHECK (status IN ('pending','succeeded','failed','reversed')),
        amount              INT NOT NULL,
        currency            TEXT NOT NULL,
        src_acc_id          BIGINT NULL,
        dst_acc_id          BIGINT NULL,
        is_refunded         BOOLEAN NOT NULL DEFAULT FALSE,
        refunded_payment_id BIGINT NULL,
        idempotency_key     TEXT NULL,
        created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_transactions_order_id FOREIGN KEY (order_id) REFERENCES orders(id),
        CONSTRAINT fk_transactions_refunded_payment_id FOREIGN KEY (refunded_payment_id) REFERENCES transactions(id),
        CONSTRAINT uq_transactions_idempotency_key UNIQUE (idempotency_key)
    );

    -- supports order detail expansion (1 round trip per order's tx ledger)
    CREATE INDEX idx_transactions_order_id ON transactions (order_id);
    -- supports webhook idempotency lookup by provider reference
    CREATE INDEX idx_transactions_provider_reference_id ON transactions (provider_reference_id) WHERE provider_reference_id IS NOT NULL;
    -- supports restaurant payout history: GET /restaurant/payouts?from=&to=
    CREATE INDEX idx_transactions_dst_acc_type_created_at ON transactions (dst_acc_id, transaction_type, created_at DESC) WHERE transaction_type = 'payout';
    -- supports finance reconciliation by status + type
    CREATE INDEX idx_transactions_type_status_created_at ON transactions (transaction_type, status, created_at DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS transactions;`);
}
