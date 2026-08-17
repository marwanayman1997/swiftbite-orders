import { Knex } from "knex";
import { TransactionEntity } from "../entity/transaction.entity.ts";
import {
  TransactionMethod,
  TransactionStatus,
  TransactionType,
} from "../enums.ts";
import {
  applyCursorPagination,
  buildPaginationResult,
  PaginationMeta,
  PaginationParams,
} from "../../../lib/http/pagination/cursor-pagination.ts";

const TRANSACTION_COLUMNS = [
  "id",
  "region",
  "order_id",
  "transaction_type",
  "method",
  "provider_id",
  "provider_reference_id",
  "status",
  "amount",
  "currency",
  "src_acc_id",
  "dst_acc_id",
  "is_refunded",
  "refunded_payment_id",
  "idempotency_key",
  "created_at",
  "updated_at",
];

function toEntity(row: any): TransactionEntity {
  return new TransactionEntity({
    id: Number(row.id),
    region: row.region,
    orderId: row.order_id !== null ? Number(row.order_id) : null,
    transactionType: row.transaction_type,
    method: row.method,
    providerId: row.provider_id !== null ? Number(row.provider_id) : null,
    providerReferenceId: row.provider_reference_id,
    status: row.status,
    amount: Number(row.amount),
    currency: row.currency,
    srcAccId: row.src_acc_id !== null ? Number(row.src_acc_id) : null,
    dstAccId: row.dst_acc_id !== null ? Number(row.dst_acc_id) : null,
    isRefunded: row.is_refunded,
    refundedPaymentId:
      row.refunded_payment_id !== null ? Number(row.refunded_payment_id) : null,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface CreateTransactionInput {
  region: string;
  orderId?: number | null;
  transactionType: TransactionType;
  method: TransactionMethod;
  providerId?: number | null;
  providerReferenceId?: string | null;
  status: TransactionStatus;
  amount: number;
  currency: string;
  srcAccId?: number | null;
  dstAccId?: number | null;
  idempotencyKey?: string | null;
}

export async function createTransaction(
  conn: Knex,
  data: CreateTransactionInput,
): Promise<TransactionEntity> {
  const [row] = await conn("transactions")
    .insert({
      region: data.region,
      order_id: data.orderId ?? null,
      transaction_type: data.transactionType,
      method: data.method,
      provider_id: data.providerId ?? null,
      provider_reference_id: data.providerReferenceId ?? null,
      status: data.status,
      amount: data.amount,
      currency: data.currency,
      src_acc_id: data.srcAccId ?? null,
      dst_acc_id: data.dstAccId ?? null,
      idempotency_key: data.idempotencyKey ?? null,
    })
    .returning(TRANSACTION_COLUMNS);
  return toEntity(row);
}

export async function findTransactionById(
  conn: Knex,
  id: number,
): Promise<TransactionEntity | undefined> {
  const row = await conn("transactions")
    .select(TRANSACTION_COLUMNS)
    .where("id", id)
    .first();
  return row ? toEntity(row) : undefined;
}

export async function findTransactionsByOrderId(
  conn: Knex,
  orderId: number,
): Promise<TransactionEntity[]> {
  const rows = await conn("transactions")
    .select(TRANSACTION_COLUMNS)
    .where("order_id", orderId)
    .orderBy("created_at", "asc");
  return rows.map(toEntity);
}

export async function findSucceededChargeByOrderId(
  conn: Knex,
  orderId: number,
): Promise<TransactionEntity | undefined> {
  const row = await conn("transactions")
    .select(TRANSACTION_COLUMNS)
    .where("order_id", orderId)
    .whereIn("transaction_type", [
      TransactionType.CHARGE,
      TransactionType.COD_COLLECTION,
    ])
    .where("status", TransactionStatus.SUCCEEDED)
    .first();
  return row ? toEntity(row) : undefined;
}

export async function findPendingCodCollectionByOrderId(
  conn: Knex,
  orderId: number,
): Promise<TransactionEntity | undefined> {
  const row = await conn("transactions")
    .select(TRANSACTION_COLUMNS)
    .where("order_id", orderId)
    .where("transaction_type", TransactionType.COD_COLLECTION)
    .where("status", TransactionStatus.PENDING)
    .first();
  return row ? toEntity(row) : undefined;
}

export async function findPendingRefundByProviderReferenceId(
  conn: Knex,
  providerReferenceId: string,
): Promise<TransactionEntity | undefined> {
  const row = await conn("transactions")
    .select(TRANSACTION_COLUMNS)
    .where("provider_reference_id", providerReferenceId)
    .where("transaction_type", TransactionType.REFUND)
    .first();
  return row ? toEntity(row) : undefined;
}

export async function updateTransactionStatus(
  conn: Knex,
  id: number,
  status: TransactionStatus,
): Promise<TransactionEntity | undefined> {
  const [row] = await conn("transactions")
    .where("id", id)
    .update({ status, updated_at: new Date().toISOString() })
    .returning(TRANSACTION_COLUMNS);
  return row ? toEntity(row) : undefined;
}

export async function setTransactionProviderReferenceId(
  conn: Knex,
  id: number,
  providerReferenceId: string,
): Promise<void> {
  await conn("transactions").where("id", id).update({
    provider_reference_id: providerReferenceId,
    updated_at: new Date().toISOString(),
  });
}

export async function findTransactionByIdempotencyKey(
  conn: Knex,
  idempotencyKey: string,
): Promise<TransactionEntity | undefined> {
  const row = await conn("transactions")
    .select(TRANSACTION_COLUMNS)
    .where("idempotency_key", idempotencyKey)
    .first();
  return row ? toEntity(row) : undefined;
}

export interface PayoutsPage {
  data: TransactionEntity[];
  meta: PaginationMeta;
}

// dst_acc_id holds the restaurantId for payout transactions (see the
// idx_transactions_dst_acc_type_created_at index comment in the migration).
export async function findPayouts(
  conn: Knex,
  restaurantId: number,
  from: Date,
  to: Date,
  pagination: PaginationParams,
): Promise<PayoutsPage> {
  let query = conn("transactions")
    .select(TRANSACTION_COLUMNS)
    .where("dst_acc_id", restaurantId)
    .where("transaction_type", TransactionType.PAYOUT)
    .where("created_at", ">=", from.toISOString())
    .where("created_at", "<=", to.toISOString());
  query = applyCursorPagination(
    query,
    { ...pagination, sortBy: "created_at" },
    conn,
    "id",
  );

  const rows = await query;
  const { data: rawRows, meta } = buildPaginationResult(
    rows,
    pagination.limit,
    "created_at",
    "id",
  );
  return { data: rawRows.map(toEntity), meta };
}

export async function markChargeRefunded(
  conn: Knex,
  chargeId: number,
  refundTransactionId: number,
): Promise<void> {
  await conn("transactions").where("id", chargeId).update({
    is_refunded: true,
    refunded_payment_id: refundTransactionId,
    updated_at: new Date().toISOString(),
  });
}
