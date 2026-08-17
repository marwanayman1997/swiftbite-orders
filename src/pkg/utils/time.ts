type TimeUnit = "d" | "h" | "m" | "s";

const multipliers: Record<TimeUnit, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function toMs(value: number, unit: TimeUnit): number {
  return value * multipliers[unit];
}

// Always bind timestamps to `timestamp without time zone` columns as an ISO
// string, never a raw JS Date object. node-postgres serializes bound Date
// objects using the *local process* timezone, not UTC — on a host whose
// local timezone isn't UTC (this Postgres session runs on Etc/UTC), that
// silently writes the wrong wall-clock value. See lib/knex/knex.ts for the
// matching read-side fix.
export function nowIso(): string {
  return new Date().toISOString();
}
