import { messageBroker } from "../messaging/init.ts";
import { cacheProvider } from "../cache/init.ts";
import { env } from "../config/env.ts";
import { logger } from "../logger/logger.ts";
import type { CoreEventEnvelope, CoreEventHandler } from "./types.ts";

const DEDUPE_TTL_SECONDS = 24 * 60 * 60;

const handlers = new Map<string, CoreEventHandler>();

export function registerCoreEventHandler(
  eventType: string,
  handler: CoreEventHandler,
): void {
  handlers.set(eventType, handler);
}

// Declares the queue/bindings/DLQ this service owns (idempotent — safe to run
// on every boot), then consumes with manual ack: dedupe via Redis SETNX,
// dispatch by eventType, ack on success. On handler throw, rabbitmq.client.ts
// nacks with requeue=false so the message flows to the DLQ.
export async function startCoreEventsConsumer(): Promise<void> {
  await messageBroker.connect();

  await messageBroker.declareTopology({
    exchanges: [
      { name: env.rabbitmq.coreEventsExchange, type: "topic", durable: true },
      { name: env.rabbitmq.coreEventsDlx, type: "topic", durable: true },
    ],
    queues: [
      {
        name: env.rabbitmq.coreEventsQueue,
        durable: true,
        deadLetterExchange: env.rabbitmq.coreEventsDlx,
      },
      { name: env.rabbitmq.coreEventsDlq, durable: true },
    ],
    bindings: [
      ...env.rabbitmq.coreEventsBindings.map((pattern) => ({
        exchange: env.rabbitmq.coreEventsExchange,
        queue: env.rabbitmq.coreEventsQueue,
        pattern,
      })),
      {
        exchange: env.rabbitmq.coreEventsDlx,
        queue: env.rabbitmq.coreEventsDlq,
        pattern: "#",
      },
    ],
  });

  await messageBroker.consume(
    env.rabbitmq.coreEventsQueue,
    env.rabbitmq.prefetch,
    async (message) => {
      const envelope = message.content as CoreEventEnvelope;

      const isFresh = await cacheProvider.trySet(
        `core-events:dedupe:${envelope.eventId}`,
        "1",
        DEDUPE_TTL_SECONDS,
      );
      if (!isFresh) {
        logger.info("core-event already processed, skipping", {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
        });
        return;
      }

      const handler = handlers.get(envelope.eventType);
      if (!handler) {
        logger.info("core-event has no registered handler, acking", {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
        });
        return;
      }

      await handler(envelope.payload);
    },
  );

  logger.info("core-events consumer started", {
    queue: env.rabbitmq.coreEventsQueue,
    bindings: env.rabbitmq.coreEventsBindings,
  });
}
