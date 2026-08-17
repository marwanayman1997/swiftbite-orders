import { REGIONS } from "../sharding/regions.ts";
import { env } from "../config/env.ts";
import { logger } from "../logger/logger.ts";
import { runArchivalOnce } from "./archival.worker.ts";

// Always-on path: one interval timer covering every region, started from
// server.ts. The real per-region "kill mid-run" testing vehicle is the
// standalone `npm run worker:archival:once` script (run-archival-once.ts) —
// this scheduler exists for the production-shaped "just runs nightly"
// story, gated off when archive shards aren't configured everywhere.
export function startArchivalScheduler(): void {
  if (!env.archival.enabled) {
    logger.info("Archival scheduler disabled (ARCHIVAL_ENABLED=false)");
    return;
  }

  setInterval(() => {
    for (const region of REGIONS) {
      runArchivalOnce(region).catch((err) => {
        logger.error("Archival run failed", {
          region,
          error: (err as Error).message,
        });
      });
    }
  }, env.archival.intervalMin * 60_000);

  logger.info("Archival scheduler started", {
    intervalMin: env.archival.intervalMin,
  });
}
