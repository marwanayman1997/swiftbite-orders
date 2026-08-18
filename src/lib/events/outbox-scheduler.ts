import { REGIONS } from "../sharding/regions.ts";
import { env } from "../config/env.ts";
import { logger } from "../logger/logger.ts";
import { messageBroker } from "../messaging/init.ts";
import { drainOutboxForRegion } from "./drain-outbox.ts";

// order-service has no separate worker process (unlike core-service's
// worker.ts) — everything runs in-process off server.ts, same shape as
// lib/jobs/archival-scheduler.ts: one interval covering every region, gated
// by an env flag.
export async function startOutboxScheduler(): Promise<void> {
  if (!env.outbox.drainEnabled) {
    logger.info("Outbox drain scheduler disabled (OUTBOX_DRAIN_ENABLED=false)");
    return;
  }

  // The order.events exchange is declared here (defensively idempotent, safe
  // on every boot) — this service only ever publishes to it, nothing binds a
  // queue on it from within this process.
  await messageBroker.connect();
  await messageBroker.declareTopology({
    exchanges: [
      { name: env.rabbitmq.orderEventsExchange, type: "topic", durable: true },
    ],
  });

  setInterval(() => {
    for (const region of REGIONS) {
      drainOutboxForRegion(region).catch((err) => {
        logger.error("Outbox drain failed", {
          region,
          error: (err as Error).message,
        });
      });
    }
  }, env.outbox.drainIntervalMs);

  logger.info("Outbox drain scheduler started", {
    intervalMs: env.outbox.drainIntervalMs,
  });
}
