import { Knex } from "knex";
import { OrderEntity } from "../entity/order.entity.ts";
import { OrderStatus } from "../enums.ts";
import {
  applyCursorPagination,
  applyFilters,
  buildPaginationResult,
  FilterParams,
  PaginationMeta,
  PaginationParams,
} from "../../../lib/http/pagination/cursor-pagination.ts";
import { nowIso } from "../../../pkg/utils/time.ts";

export const ORDER_COLUMNS = [
  "id",
  "region",
  "public_id",
  "country_code",
  "restaurant_id",
  "branch_id",
  "customer_id",
  "customer_address_id",
  "delivery_lat",
  "delivery_lng",
  "delivery_address_text_snapshot",
  "status",
  "subtotal",
  "delivery_fee",
  "service_fee",
  "total",
  "commission",
  "currency",
  "payment_method",
  "delivery_agent_id",
  "created_at",
  "updated_at",
  "accepted_at",
  "rejected_at",
  "ready_at",
  "assigned_at",
  "picked_at",
  "delivered_at",
  "cancelled_at",
];

function toEntity(row: any): OrderEntity {
  return new OrderEntity({
    id: Number(row.id),
    region: row.region,
    publicId: row.public_id,
    countryCode: row.country_code,
    restaurantId: Number(row.restaurant_id),
    branchId: Number(row.branch_id),
    customerId: Number(row.customer_id),
    customerAddressId: Number(row.customer_address_id),
    deliveryLat: Number(row.delivery_lat),
    deliveryLng: Number(row.delivery_lng),
    deliveryAddressTextSnapshot: row.delivery_address_text_snapshot,
    status: row.status,
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee),
    serviceFee: Number(row.service_fee),
    total: Number(row.total),
    commission: Number(row.commission),
    currency: row.currency,
    paymentMethod: row.payment_method,
    deliveryAgentId:
      row.delivery_agent_id !== null ? Number(row.delivery_agent_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
    readyAt: row.ready_at,
    assignedAt: row.assigned_at,
    pickedAt: row.picked_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
  });
}

export interface CreateOrderInput {
  region: string;
  publicId: string;
  countryCode: string;
  restaurantId: number;
  branchId: number;
  customerId: number;
  customerAddressId: number;
  deliveryLat: number;
  deliveryLng: number;
  deliveryAddressTextSnapshot: string;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  currency: string;
  paymentMethod: string;
}

export async function createOrder(
  conn: Knex,
  data: CreateOrderInput,
): Promise<OrderEntity> {
  const [row] = await conn("orders")
    .insert({
      region: data.region,
      public_id: data.publicId,
      country_code: data.countryCode,
      restaurant_id: data.restaurantId,
      branch_id: data.branchId,
      customer_id: data.customerId,
      customer_address_id: data.customerAddressId,
      delivery_lat: data.deliveryLat,
      delivery_lng: data.deliveryLng,
      delivery_address_text_snapshot: data.deliveryAddressTextSnapshot,
      status: data.status,
      subtotal: data.subtotal,
      delivery_fee: data.deliveryFee,
      service_fee: data.serviceFee,
      total: data.total,
      currency: data.currency,
      payment_method: data.paymentMethod,
    })
    .returning(ORDER_COLUMNS);
  return toEntity(row);
}

export async function findOrderByPublicId(
  conn: Knex,
  publicId: string,
): Promise<OrderEntity | undefined> {
  const row = await conn("orders")
    .select(ORDER_COLUMNS)
    .where("public_id", publicId)
    .first();
  return row ? toEntity(row) : undefined;
}

export async function findOrderById(
  conn: Knex,
  id: number,
): Promise<OrderEntity | undefined> {
  const row = await conn("orders")
    .select(ORDER_COLUMNS)
    .where("id", id)
    .first();
  return row ? toEntity(row) : undefined;
}

export async function findOrdersByCustomer(
  conn: Knex,
  customerId: number,
  year: number,
  pagination: PaginationParams,
): Promise<{ data: OrderEntity[]; meta: PaginationMeta }> {
  let query = conn("orders")
    .select(ORDER_COLUMNS)
    .where("customer_id", customerId)
    .whereRaw("EXTRACT(YEAR FROM created_at) = ?", [year]);
  query = applyCursorPagination(query, pagination, conn);

  const rows = await query;
  const { data, meta } = buildPaginationResult(
    rows,
    pagination.limit,
    pagination.sortBy,
  );
  return { data: data.map(toEntity), meta };
}

export async function findOrdersByBranch(
  conn: Knex,
  branchId: number,
  filters: FilterParams[],
  pagination: PaginationParams,
): Promise<{ data: OrderEntity[]; meta: PaginationMeta }> {
  let query = conn("orders").select(ORDER_COLUMNS).where("branch_id", branchId);
  query = applyFilters(query, filters);
  query = applyCursorPagination(query, pagination, conn);

  const rows = await query;
  const { data, meta } = buildPaginationResult(
    rows,
    pagination.limit,
    pagination.sortBy,
  );
  return { data: data.map(toEntity), meta };
}

const STATUS_TIMESTAMP_COLUMN: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.ACCEPTED]: "accepted_at",
  [OrderStatus.REJECTED]: "rejected_at",
  [OrderStatus.READY]: "ready_at",
  [OrderStatus.ASSIGNED]: "assigned_at",
  [OrderStatus.PICKED]: "picked_at",
  [OrderStatus.DELIVERED]: "delivered_at",
  [OrderStatus.CANCELLED]: "cancelled_at",
};

export async function updateOrderStatus(
  conn: Knex,
  id: number,
  status: OrderStatus,
): Promise<OrderEntity | undefined> {
  const payload: Record<string, unknown> = {
    status,
    updated_at: nowIso(),
  };
  const tsColumn = STATUS_TIMESTAMP_COLUMN[status];
  if (tsColumn) {
    payload[tsColumn] = nowIso();
  }

  const [row] = await conn("orders")
    .where("id", id)
    .update(payload)
    .returning(ORDER_COLUMNS);
  return row ? toEntity(row) : undefined;
}

export async function setDeliveryAgent(
  conn: Knex,
  id: number,
  agentId: number,
): Promise<OrderEntity | undefined> {
  const [row] = await conn("orders")
    .where("id", id)
    .update({
      delivery_agent_id: agentId,
      status: OrderStatus.ASSIGNED,
      assigned_at: nowIso(),
      updated_at: nowIso(),
    })
    .returning(ORDER_COLUMNS);
  return row ? toEntity(row) : undefined;
}

// Money-critical — always call inside the same trx as the rest of the
// delivered settlement (delivery.service.ts).
export async function setOrderCommission(
  conn: Knex,
  id: number,
  commission: number,
): Promise<void> {
  await conn("orders")
    .where("id", id)
    .update({ commission, updated_at: nowIso() });
}
