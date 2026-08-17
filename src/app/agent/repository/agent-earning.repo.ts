import { Knex } from "knex";
import { AgentEarningEntity } from "../entity/agent-earning.entity.ts";
import {
  applyCursorPagination,
  buildPaginationResult,
  PaginationMeta,
  PaginationParams,
} from "../../../lib/http/pagination/cursor-pagination.ts";

const COLUMNS = [
  "id",
  "region",
  "agent_id",
  "order_id",
  "delivery_id",
  "amount",
  "currency",
  "earned_at",
];

function toEntity(row: any): AgentEarningEntity {
  return new AgentEarningEntity({
    id: Number(row.id),
    region: row.region,
    agentId: Number(row.agent_id),
    orderId: Number(row.order_id),
    deliveryId: Number(row.delivery_id),
    amount: Number(row.amount),
    currency: row.currency,
    earnedAt: row.earned_at,
  });
}

export interface CreateAgentEarningInput {
  region: string;
  agentId: number;
  orderId: number;
  deliveryId: number;
  amount: number;
  currency: string;
}

// Unique on delivery_id makes this idempotent — a settlement retry for the
// same delivery is a no-op, returning the original row.
export async function createAgentEarning(
  conn: Knex,
  data: CreateAgentEarningInput,
): Promise<AgentEarningEntity> {
  const rows = await conn("agent_earnings")
    .insert({
      region: data.region,
      agent_id: data.agentId,
      order_id: data.orderId,
      delivery_id: data.deliveryId,
      amount: data.amount,
      currency: data.currency,
    })
    .onConflict("delivery_id")
    .ignore()
    .returning(COLUMNS);

  if (rows.length > 0) return toEntity(rows[0]);
  const existing = await findAgentEarningByDeliveryId(conn, data.deliveryId);
  return existing!;
}

export async function findAgentEarningByDeliveryId(
  conn: Knex,
  deliveryId: number,
): Promise<AgentEarningEntity | undefined> {
  const row = await conn("agent_earnings")
    .select(COLUMNS)
    .where("delivery_id", deliveryId)
    .first();
  return row ? toEntity(row) : undefined;
}

export interface AgentEarningsPage {
  data: AgentEarningEntity[];
  meta: PaginationMeta;
  orderPublicIds: Map<number, string>;
}

// Joined query so the response can include each earning's order publicId
// without an N+1 follow-up lookup.
export async function findAgentEarnings(
  conn: Knex,
  agentId: number,
  from: Date,
  to: Date,
  pagination: PaginationParams,
): Promise<AgentEarningsPage> {
  let query = conn("agent_earnings as ae")
    .select(
      "ae.id",
      "ae.region",
      "ae.agent_id",
      "ae.order_id",
      "ae.delivery_id",
      "ae.amount",
      "ae.currency",
      "ae.earned_at",
      "o.public_id as order_public_id",
    )
    .join("orders as o", "o.id", "ae.order_id")
    .where("ae.agent_id", agentId)
    .where("ae.earned_at", ">=", from.toISOString())
    .where("ae.earned_at", "<=", to.toISOString());
  query = applyCursorPagination(
    query,
    { ...pagination, sortBy: "ae.earned_at" },
    conn,
    "ae.id",
  );

  const rows = await query;
  const { data: rawRows, meta } = buildPaginationResult(
    rows,
    pagination.limit,
    "ae.earned_at",
    "ae.id",
  );

  const orderPublicIds = new Map<number, string>();
  const data = rawRows.map((row: any) => {
    orderPublicIds.set(Number(row.id), row.order_public_id);
    return toEntity(row);
  });

  return { data, meta, orderPublicIds };
}

export async function sumAgentEarnings(
  conn: Knex,
  agentId: number,
  from: Date,
  to: Date,
): Promise<{ count: number; sum: number }> {
  const row = await conn("agent_earnings")
    .where("agent_id", agentId)
    .where("earned_at", ">=", from.toISOString())
    .where("earned_at", "<=", to.toISOString())
    .count("* as count")
    .sum("amount as sum")
    .first();
  return { count: Number(row?.count ?? 0), sum: Number(row?.sum ?? 0) };
}
