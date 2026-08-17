# swiftbite-orders

The order-service microservice: order placement, Kashier online payments, delivery assignment/tracking, agent presence & earnings, restaurant finance (balance/payouts), live updates over WebSocket, and nightly cold-storage archival. Region-sharded by country (`eg`, `ksa` today) — every table, connection, and background job is per-region, not global.

Sibling repo `swiftbite-core` owns restaurants/branches/products/users/RBAC and is the source of truth for that data; this service reads it synchronously for hot paths (via internal, api-key-guarded endpoints) and asynchronously via a RabbitMQ event stream for cache invalidation.

## Stack

- Node.js + TypeScript (ESM, `tsx` for dev/scripts — no separate build step needed locally)
- Express + `socket.io` (WebSocket, `@socket.io/redis-adapter` for multi-instance fan-out)
- Knex + PostgreSQL — two connection pools per region: hot (`db(region)`) and cold archive (`dbArchive(region)`)
- Redis — response/read-through caching, idempotency keys, agent presence (GEO/SET/HASH), the archival worker's distributed lock
- RabbitMQ (`amqp-connection-manager`) — consumes `swiftbite-core`'s outbox events (branch/product/restaurant changes)
- Kashier (`developers.kashier.io`) — online payment sessions + webhook-driven capture/failure
- tsyringe (DI for controllers/services), Zod (env validation), class-validator/class-transformer (DTOs)
- JWT auth — reuses `swiftbite-core`-issued access tokens (same secret, same payload shape); this service never issues its own

## Getting started

1. Copy the env template and fill in your local values:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Migrate the hot shards for every region in `REGIONS`:

   ```bash
   npm run migrate:all
   ```

4. Create and migrate the archive databases (needed for the Phase 7 archival worker — see below; safe to skip if you're not touching that path yet, but `server.ts` will still try to start the archival scheduler against them unless `ARCHIVAL_ENABLED=false`):

   ```bash
   npm run db:create-archive
   npm run migrate:all:archive
   ```

5. Start the dev server:

   ```bash
   npm run dev
   ```

`swiftbite-core`'s API server **and its separate outbox worker** (`npm run worker:dev` over there) both need to be running for branch/product/restaurant cache invalidation to actually arrive here — see that repo's README.

### Testing the Kashier integration locally

Kashier needs a public URL to call back to (`PUBLIC_BASE_URL` / the webhook endpoint) — `localhost` isn't reachable from their servers. Use a tunnel (`ngrok http 4000`, or `cloudflared`) and point `PUBLIC_BASE_URL` at the tunnel's HTTPS URL before calling `POST /payments/init`; the session's `serverWebhook` is derived from that value at creation time. Sandbox base URL is `https://test-api.kashier.io`, not `https://api.kashier.io` (that's production) — confirmed empirically, not documented anywhere obvious. See `src/pkg/payments/kashier/` for the client/signature implementation and its inline comments for two more non-obvious things that only showed up against a real payload: the webhook body is nested (`{ platform, event, data: {...} }`, not flat), and the signature is HMAC'd with the **API key**, not a separately configured "webhook secret".

## Scripts

- `npm run dev` — start the server with hot reload (also starts the WS server, the RabbitMQ core-events consumer, and the in-process archival scheduler)
- `npm run build` / `npm start` — compile to `dist/` and run it
- `npm run migrate:all` — run migrations against every region's **hot** shard
- `npm run migrate:all:archive` — same, against the **archive** cluster
- `npm run db:create-archive` — one-time setup: creates the archive database per region (a migration can't create its own target DB)
- `npm run worker:archival:once [-- --region=eg]` — run the cold-archival sweep once, standalone (no HTTP server); defaults to all regions. This is also how you'd wire a real external cron/k8s CronJob in production instead of the in-process scheduler.

## Region sharding

Every request that touches the database resolves a region from the `X-Region` header — never from the JWT, a path param, or inference. `X-Region: all` is reserved for admin fan-out reads and is rejected on writes. See `src/lib/sharding/`, `src/lib/knex/shards.ts`, and `docs/system-design.md §2` for the full rationale.

## WebSocket

Clients connect to `/ws` (socket.io) with a token (`auth: { token }`, `?token=`, or the `access_token` cookie), then `subscribe(channel, ack)` to one or more rooms. Allowed channels are derived from the JWT: `customer:<userId>`, `restaurant:<restaurantId>` + `branch:<branchId>` per assigned branch, `agent:<agentId>`, `admin:alerts`. Restaurant **owners** are a special case — they don't carry an explicit `branchIds` list (core never creates per-branch membership rows for owners), so a `branch:<id>` subscription for an owner is verified dynamically against core instead of a static allow-list (`isChannelAllowed` in `src/lib/websocket/ws-auth.ts`). Subscribing to a channel you're not allowed on gets an immediate `ws_error` + disconnect, not just a failed ack. See `docs/system-design.md §7` for the full channel/event table and close codes.

## Cold archival (Phase 7)

Every night (`ARCHIVAL_INTERVAL_MIN`, default 1440), the archival worker moves rows whose `created_at` (or, for child tables, their parent order's `created_at`) is in a prior calendar year from each region's hot database into a separate archive database — the archived tables walk in two passes (parent-first insert into archive, child-first delete from hot) to satisfy FK ordering on both ends, batched, Redis-locked (`archival:<region>:lock`), and safe to `kill -9` mid-run and re-run (archive inserts are `ON CONFLICT DO NOTHING`; nothing is deleted from hot until every table has been durably archived). Read paths (`GET /customer/orders?year=`, `GET /restaurant/orders` with a fully-bounded `created_at` range, admin `GET /orders/:publicId`) transparently route to the archive connection when the requested data would live there. See `src/lib/jobs/archival.worker.ts` and `docs/implementation-plan.md` Phase 7 for the full design, including the FK/self-reference edge cases it handles.

## API summary

Base URL: all routes below are mounted under `/api`. This is a summary — full request/response DTOs, error codes, and the WebSocket event catalogue live in [`docs/api-contracts.md`](./docs/api-contracts.md) and [`docs/README.md`](./docs/README.md) (start there for anything beyond "what exists").

| Method | Path                              | Auth                     | Extras                |
| ------ | ---------------------------------- | -------------------------- | ----------------------- |
| GET    | `/health`                          | Public                     |                         |
| POST   | `/orders`                          | Auth required (customer)   | Idempotent (required, DB-backed) |
| GET    | `/orders/:publicId`                | Auth required               | admin gets archive fallback |
| PATCH  | `/orders/:publicId/status`         | Auth required (role-dependent per target status) | Idempotent (required) |
| GET    | `/customer/orders`                 | Auth required (customer)    | Paginated · archive-routed by `year` |
| GET    | `/restaurant/orders`               | RBAC (`orders:read`) + branch access | Paginated · Cached · archive/straddle-routed |
| POST   | `/payments/init`                   | Auth required (customer)    | Idempotent (required) |
| POST   | `/payments/webhook/:provider`      | Public (Kashier HMAC signature) |                     |
| GET    | `/payments/:paymentId`             | Auth required                |                       |
| POST   | `/payments/:paymentId/refund`      | Auth required                | Idempotent (required) |
| POST   | `/deliveries/assign/:orderId`      | RBAC (`deliveries:assign`)   |                       |
| POST   | `/deliveries/reassign/:orderId`    | RBAC (`deliveries:assign`)   |                       |
| PATCH  | `/deliveries/:deliveryId/status`   | Auth required (assigned agent only) |                |
| POST   | `/agents/presence/online`          | Auth required (delivery_agent) |                     |
| POST   | `/agents/presence/offline`         | Auth required (delivery_agent) | blocked while a delivery is `picked` |
| POST   | `/agents/presence/ping`            | Auth required (delivery_agent) |                     |
| GET    | `/agents/tasks`                    | Auth required (delivery_agent) | Paginated           |
| GET    | `/agents/earnings`                 | Auth required (delivery_agent) | Paginated · date-ranged |
| GET    | `/restaurant/balance`              | RBAC (`finance:read`)        |                       |
| GET    | `/restaurant/payouts`              | RBAC (`finance:read`)        | Paginated             |
| POST   | `/restaurant/payouts`              | RBAC (`finance:payout_create`) | Idempotent (required, DB-backed) |

## Project structure

```
src/
  app/
    order/            # order placement, status machine, customer/restaurant order lists
    payment/           # Kashier session init, webhook processing, refunds
    delivery/            # assignment (Redis-hot-path + Postgres GIST fallback), status updates, settlement
    agent/                # presence (online/offline/ping), task list, earnings
    finance/               # restaurant balance reads, admin payout recording
    health/                 # DB health check
  lib/
    auth/                 # authenticate middleware, RBAC middleware, JWT verification (shares secret with core)
    cache/                  # generic ICacheProvider (Redis) — read-through caching
    config/                  # Zod-validated env
    core-client/              # HTTP client for core-service's internal (api-key) endpoints, with caching
    core-events/                # RabbitMQ consumer for core's outbox events + per-event-type handlers
    di/                          # tsyringe container + injection tokens
    error/                        # AppError + global error handler
    http/                          # response envelope, cursor pagination + generic filtering
    idempotency/                    # Idempotency-Key middleware (Redis + DB fallback)
    jobs/                            # cold archival worker, its Redis lock, scheduler, and standalone CLI runner
    knex/                             # hot + archive knex instances, shard config, migrate-all script
    logger/                           # logger
    payments/                         # Kashier client wiring (env → KashierClient)
    presence/                         # dedicated Redis client for agent GEO/busy-set primitives
    sharding/                         # region resolution (X-Region header) + region list
    validation/                       # validateBody wrapper
    websocket/                        # socket.io server, channel auth, publish() helper
  pkg/                    # framework-agnostic building blocks (no app/env access): cache interface,
                           #   payment provider interface + Kashier implementation, messaging interface + RabbitMQ client, utils
  migrations/              # Knex migrations — identical schema runs against hot and archive clusters
scripts/
  create-archive-dbs.ts    # one-time CREATE DATABASE for the archive cluster
  seed-archival-test-data.ts  # synthetic order-family seeder for exercising the archival worker locally
```

Each feature module under `src/app/` follows the same layered shape as `swiftbite-core`: `entity/` → `dto/` → `repository/` (Knex, takes a `conn: Knex` so callers choose hot vs. archive) → `service/` (business logic, `@injectable()`) → `controller/` (`@injectable()`) → `routes.ts` (resolves its controller via `container.resolve()`). Cross-module reads go through narrow accessor methods (e.g. `OrderService.getOrderEntityById`); cross-module **writes** that must land in the same transaction as another module's write import that module's repository function directly, always with a comment explaining why — see `CLAUDE.md` and `docs/folder-structure.md`.

