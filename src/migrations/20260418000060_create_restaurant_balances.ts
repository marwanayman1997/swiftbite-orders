import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE restaurant_balances (
        restaurant_id   BIGINT NOT NULL,
        region          TEXT NOT NULL,
        currency        TEXT NOT NULL,
        balance         INT NOT NULL DEFAULT 0,
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (restaurant_id, currency)
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS restaurant_balances;`);
}
