import "reflect-metadata";
import http from "http";
import { createApp } from "./app.ts";
import { env } from "./lib/config/env.ts";
import { pingAll, destroyAll } from "./lib/knex/knex.ts";
import { attachWsServer } from "./lib/websocket/ws-server.ts";
import { startCoreEventsConsumer } from "./lib/core-events/consumer.ts";
import { registerCoreEventHandlers } from "./lib/core-events/register-handlers.ts";
import { startArchivalScheduler } from "./lib/jobs/archival-scheduler.ts";
import { container } from "./lib/di/container.ts";
import { TOKENS } from "./lib/di/tokens.ts";
import { logger } from "./lib/logger/logger.ts";

const app = createApp();
const server = http.createServer(app);

const io = attachWsServer(server);
container.registerInstance(TOKENS.WsServer, io);

registerCoreEventHandlers();

startCoreEventsConsumer().catch((err) => {
  logger.error("Failed to start core-events consumer", { error: err.message });
});

startArchivalScheduler();

pingAll()
  .then(() => logger.info("All shards reachable at boot"))
  .catch((err) =>
    logger.error("Shard ping failed at boot", { error: err.message }),
  );

server.listen(env.port, () => {
  console.log(`Server is listening on port ${env.port}`);
});

async function shutdown(): Promise<void> {
  server.close(async (): Promise<void> => {
    console.log("Shards are shutting down...");
    await destroyAll();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
