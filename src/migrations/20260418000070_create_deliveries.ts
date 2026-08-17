import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE deliveries (
        id              BIGSERIAL PRIMARY KEY,
        region          TEXT NOT NULL,
        order_id        BIGINT NOT NULL,
        agent_id        BIGINT NOT NULL,
        status          TEXT NOT NULL CHECK (status IN (
                            'assigned','accepted','rejected','picked','delivered','cancelled','reassigned'
                        )),
        pickup_lat      DECIMAL(10,7) NOT NULL,
        pickup_lng      DECIMAL(10,7) NOT NULL,
        dropoff_lat     DECIMAL(10,7) NOT NULL,
        dropoff_lng     DECIMAL(10,7) NOT NULL,
        distance_meters INT NULL,
        earning_amount  INT NULL,
        currency        TEXT NOT NULL,
        assigned_at     TIMESTAMP NOT NULL DEFAULT NOW(),
        accepted_at     TIMESTAMP NULL,
        rejected_at     TIMESTAMP NULL,
        picked_at       TIMESTAMP NULL,
        delivered_at    TIMESTAMP NULL,
        reassigned_at   TIMESTAMP NULL,
        reassigned_from BIGINT NULL,

        CONSTRAINT fk_deliveries_order_id FOREIGN KEY (order_id) REFERENCES orders(id),
        CONSTRAINT fk_deliveries_reassigned_from FOREIGN KEY (reassigned_from) REFERENCES deliveries(id)
    );

    -- supports GET /agents/tasks?status= (per-agent lookup with status filter)
    CREATE INDEX idx_deliveries_agent_id_status_assigned_at ON deliveries (agent_id, status, assigned_at DESC);
    -- supports order -> delivery lookup
    CREATE INDEX idx_deliveries_order_id ON deliveries (order_id);
    -- supports reassignment chain traversal
    CREATE INDEX idx_deliveries_reassigned_from ON deliveries (reassigned_from) WHERE reassigned_from IS NOT NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS deliveries;`);
}
