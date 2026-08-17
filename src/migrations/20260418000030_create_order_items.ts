import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE order_items (
        id                  BIGSERIAL PRIMARY KEY,
        region              TEXT NOT NULL,
        order_id            BIGINT NOT NULL,
        product_id          BIGINT NOT NULL,
        quantity            INT NOT NULL CHECK (quantity > 0),
        unit_price_snapshot INT NOT NULL,
        name_snapshot       TEXT NOT NULL,
        image_url_snapshot  TEXT NULL,
        line_total          INT NOT NULL,
        created_at          TIMESTAMP NOT NULL DEFAULT NOW(),

        CONSTRAINT fk_order_items_order_id FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    -- supports GET /orders/{orderId} expansion (batch fetch via whereIn for lists)
    CREATE INDEX idx_order_items_order_id ON order_items (order_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS order_items;`);
}
