import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE orders (
        id              BIGSERIAL PRIMARY KEY,
        region          TEXT NOT NULL,
        public_id       UUID NOT NULL UNIQUE,
        country_code    TEXT NOT NULL,
        restaurant_id   BIGINT NOT NULL,
        branch_id       BIGINT NOT NULL,
        customer_id     BIGINT NOT NULL,
        customer_address_id BIGINT NOT NULL,
        delivery_lat    DECIMAL(10,7) NOT NULL,
        delivery_lng    DECIMAL(10,7) NOT NULL,
        delivery_address_text_snapshot TEXT NOT NULL,
        status          TEXT NOT NULL CHECK (status IN (
                            'pending_payment','placed','accepted','rejected',
                            'preparing','ready','assigned','picked','delivered','cancelled'
                        )),
        subtotal        INT NOT NULL,
        delivery_fee    INT NOT NULL,
        service_fee     INT NOT NULL,
        total           INT NOT NULL,
        commission      INT NOT NULL DEFAULT 0,
        currency        TEXT NOT NULL,
        payment_method  TEXT NOT NULL CHECK (payment_method IN ('online','cod')),
        delivery_agent_id BIGINT,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        accepted_at     TIMESTAMP NULL,
        rejected_at     TIMESTAMP NULL,
        ready_at        TIMESTAMP NULL,
        assigned_at     TIMESTAMP NULL,
        picked_at       TIMESTAMP NULL,
        delivered_at    TIMESTAMP NULL,
        cancelled_at    TIMESTAMP NULL
    );

    -- supports GET /orders/{publicId}
    CREATE INDEX idx_orders_public_id ON orders (public_id);
    -- supports GET /customer/orders?year=YYYY
    CREATE INDEX idx_orders_customer_id_created_at ON orders (customer_id, created_at DESC);
    -- supports GET /restaurant/orders?branchId=&status=&from=&to=
    CREATE INDEX idx_orders_branch_status_created_at ON orders (branch_id, status, created_at DESC);
    -- supports delivery assignment scan for pending assignment in a region
    CREATE INDEX idx_orders_status_created_at ON orders (status, created_at) WHERE status IN ('ready','assigned');
    -- supports GET /agents/tasks?status=
    CREATE INDEX idx_orders_delivery_agent_id_status ON orders (delivery_agent_id, status) WHERE delivery_agent_id IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS orders;`);
}
