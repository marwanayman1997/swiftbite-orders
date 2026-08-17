import { Knex } from "knex";
import { v4 as uuidv4 } from "uuid";
import { db, dbArchive } from "../knex/knex.ts";
import { env } from "../config/env.ts";
import { logger } from "../logger/logger.ts";
import { acquireLock, releaseLock, renewLock } from "./archival-lock.ts";

const BATCH_SIZE = 1000;

type EligibilityFilter = (qb: Knex.QueryBuilder, cutoffIso: string) => void;

// Every order-linked table is filtered by its *parent order's* created_at,
// not its own timestamp column (deliveries/agent_earnings/payment_webhook_events
// don't all even have one) — this keeps a whole order family moving together
// in the same run, avoiding a child stranded in hot because its own
// timestamp landed on the other side of the year boundary from its order.
const byParentOrder: EligibilityFilter = (qb, cutoffIso) => {
  qb.whereIn("order_id", (sub) => {
    sub.select("id").from("orders").where("created_at", "<", cutoffIso);
  });
};

const TABLE_ELIGIBILITY: Record<string, EligibilityFilter> = {
  orders: (qb, cutoffIso) => qb.where("created_at", "<", cutoffIso),
  order_items: byParentOrder,
  transactions: byParentOrder,
  payment_sessions: byParentOrder,
  deliveries: byParentOrder,
  agent_earnings: byParentOrder,
  // No order_id column at all — filtered independently by its own timestamp.
  payment_webhook_events: (qb, cutoffIso) =>
    qb.where("received_at", "<", cutoffIso),
};

// Pass 1 (archive insert) must be parent-first so a child's FK target
// already exists in archive when it's inserted. Pass 2 (hot delete) is the
// exact reverse — child-first, so hot's still-live FKs never block a delete.
const PASS1_INSERT_ORDER = [
  "orders",
  "order_items",
  "transactions",
  "payment_sessions",
  "payment_webhook_events",
  "deliveries",
  "agent_earnings",
];
const PASS2_DELETE_ORDER = [
  "agent_earnings",
  "deliveries",
  "payment_webhook_events",
  "payment_sessions",
  "transactions",
  "order_items",
  "orders",
];

export interface ArchivalSummary {
  region: string;
  totalMoved: number;
  inserted: Record<string, number>;
  deleted: Record<string, number>;
}

function cutoffIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
}

class RuntimeBudget {
  private readonly deadline: number;
  constructor(maxRuntimeMin: number) {
    this.deadline = Date.now() + maxRuntimeMin * 60_000;
  }
  exceeded(): boolean {
    return Date.now() >= this.deadline;
  }
}

class LockKeepAlive {
  private lastRenewAt = Date.now();
  private readonly renewEveryMs: number;
  constructor(
    private readonly region: string,
    private readonly token: string,
    private readonly ttlSec: number,
  ) {
    this.renewEveryMs = (ttlSec * 1000) / 3;
  }
  async maybeRenew(): Promise<void> {
    if (Date.now() - this.lastRenewAt < this.renewEveryMs) return;
    await renewLock(this.region, this.token, this.ttlSec);
    this.lastRenewAt = Date.now();
  }
}

// Pass 1: SELECT hot in ascending-id batches (cursor-tracked in-memory,
// since nothing is deleted from hot yet — a plain LIMIT without a cursor
// would return the same rows forever), INSERT into archive with
// ON CONFLICT DO NOTHING (safe no-op on a re-run after a crash).
async function runInsertPass(
  region: string,
  table: string,
  budget: RuntimeBudget,
  lock: LockKeepAlive,
): Promise<number> {
  const hot = db(region);
  const archive = dbArchive(region);
  const eligible = TABLE_ELIGIBILITY[table];
  const cutoff = cutoffIso();

  let cursor = 0;
  let moved = 0;

  while (!budget.exceeded()) {
    const start = Date.now();
    const rows = await hot(table)
      .select("*")
      .where((qb) => eligible(qb, cutoff))
      .andWhere("id", ">", cursor)
      .orderBy("id", "asc")
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;

    const trx = await archive.transaction();
    try {
      await trx(table).insert(rows).onConflict("id").ignore();
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    cursor = rows[rows.length - 1].id;
    moved += rows.length;
    logger.info("Archival batch (insert)", {
      region,
      table,
      pass: "insert",
      moved: rows.length,
      durationMs: Date.now() - start,
    });

    await lock.maybeRenew();
    if (rows.length < BATCH_SIZE) break;
  }

  return moved;
}

// Pass 2: SELECT hot in descending-id batches (no cursor needed — rows are
// deleted as they're processed, so the next query naturally returns the
// next batch), DELETE by id. Descending order guarantees a self-referencing
// row (deliveries.reassigned_from, transactions.refunded_payment_id — both
// always point to a *lower* id, since a reassignment/refund is always
// created after what it references) is deleted before the row it
// references, regardless of batch boundaries.
async function runDeletePass(
  region: string,
  table: string,
  budget: RuntimeBudget,
  lock: LockKeepAlive,
): Promise<number> {
  const hot = db(region);
  const eligible = TABLE_ELIGIBILITY[table];
  const cutoff = cutoffIso();

  let moved = 0;

  while (!budget.exceeded()) {
    const start = Date.now();
    const rows = await hot(table)
      .select("id")
      .where((qb) => eligible(qb, cutoff))
      .orderBy("id", "desc")
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;

    const ids = rows.map((r: { id: number }) => r.id);
    const trx = await hot.transaction();
    try {
      await trx(table).whereIn("id", ids).del();
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    moved += ids.length;
    logger.info("Archival batch (delete)", {
      region,
      table,
      pass: "delete",
      moved: ids.length,
      durationMs: Date.now() - start,
    });

    await lock.maybeRenew();
    if (rows.length < BATCH_SIZE) break;
  }

  return moved;
}

export async function runArchivalOnce(
  region: string,
): Promise<ArchivalSummary> {
  const token = uuidv4();
  const lockTtlSec = (env.archival.maxRuntimeMin + 5) * 60;
  const acquired = await acquireLock(region, token, lockTtlSec);
  if (!acquired) {
    logger.info("Archival run skipped — lock held by another run", { region });
    return { region, totalMoved: 0, inserted: {}, deleted: {} };
  }

  const budget = new RuntimeBudget(env.archival.maxRuntimeMin);
  const lock = new LockKeepAlive(region, token, lockTtlSec);
  const inserted: Record<string, number> = {};
  const deleted: Record<string, number> = {};

  try {
    for (const table of PASS1_INSERT_ORDER) {
      if (budget.exceeded()) break;
      inserted[table] = await runInsertPass(region, table, budget, lock);
    }
    for (const table of PASS2_DELETE_ORDER) {
      if (budget.exceeded()) break;
      deleted[table] = await runDeletePass(region, table, budget, lock);
    }
  } finally {
    await releaseLock(region, token);
  }

  // "moved" = rows fully migrated (archived AND removed from hot) — the
  // delete count, not the insert count, is the true measure a re-run's
  // "moved=0" acceptance check cares about.
  const totalMoved = Object.values(deleted).reduce((a, b) => a + b, 0);
  logger.info("Archival run complete", {
    region,
    moved: totalMoved,
    inserted,
    deleted,
  });
  return { region, totalMoved, inserted, deleted };
}
