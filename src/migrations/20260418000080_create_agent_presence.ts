import type { Knex } from "knex";

// Pulled forward from its documented Phase 4 slot: Phase 3's own acceptance
// criteria requires the Postgres GIST candidate scan to work now
// (assignment.service.ts), and that scan reads this table. Phase 4 adds the
// presence write endpoints, Redis wiring, and agent_earnings on top of it —
// the table itself is a hard dependency of Phase 3, not Phase 4.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE EXTENSION IF NOT EXISTS postgis;

    CREATE TABLE agent_presence (
        agent_id        BIGINT PRIMARY KEY,
        region          TEXT NOT NULL,
        is_online       BOOLEAN NOT NULL DEFAULT FALSE,
        last_lat        DECIMAL(10,7) NULL,
        last_lng        DECIMAL(10,7) NULL,
        last_seen_at    TIMESTAMP NOT NULL DEFAULT NOW(),
        location        GEOGRAPHY(Point, 4326) GENERATED ALWAYS AS (
                            ST_MakePoint(last_lng::float, last_lat::float)::geography
                        ) STORED,
        updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
    );

    -- supports automatic assignment: find nearest online agents to a pickup point
    CREATE INDEX idx_agent_presence_location_gist ON agent_presence USING GIST (location) WHERE is_online = TRUE;
    -- supports cleanup of stale presence rows
    CREATE INDEX idx_agent_presence_last_seen_at ON agent_presence (last_seen_at) WHERE is_online = TRUE;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS agent_presence;`);
}
