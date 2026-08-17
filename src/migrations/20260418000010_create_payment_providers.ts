import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE payment_providers (
        id          INT PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE,
        is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
        priority    SMALLINT NOT NULL DEFAULT 100
    );

    INSERT INTO payment_providers (id, name, is_enabled, priority) VALUES
      (1, 'kashier', true, 10),
      (2, 'cod', true, 20);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS payment_providers;`);
}
