import { db } from "../knex/knex.ts";
import { env } from "../config/env.ts";
import { messageBroker } from "../messaging/init.ts";
import {
  claimUndispatchedBatch,
  markOutboxEventsDispatched,
  markOutboxEventFailed,
} from "./outbox.repo.ts";

export async function drainOutboxForRegion(
  region: string,
): Promise<{ dispatched: number; failed: number }> {
  const trx = await db(region).transaction();
  let dispatched = 0;
  let failed = 0;

  try {
    const batch = await claimUndispatchedBatch(trx, env.outbox.batchSize);
    const dispatchedIds: number[] = [];

    for (const event of batch) {
      try {
        await messageBroker.publish(
          env.rabbitmq.orderEventsExchange,
          event.eventType,
          {
            eventId: event.eventId,
            eventType: event.eventType,
            occurredAt: event.createdAt.toISOString(),
            payload: event.payload,
          },
        );
        dispatchedIds.push(event.id);
        dispatched++;
      } catch (err) {
        await markOutboxEventFailed(trx, event.id, (err as Error).message);
        failed++;
      }
    }

    await markOutboxEventsDispatched(trx, dispatchedIds);
    await trx.commit();
  } catch (err) {
    await trx.rollback();
    throw err;
  }

  return { dispatched, failed };
}
