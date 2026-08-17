import { Knex } from "knex";
import { PaymentSessionEntity } from "../entity/payment-session.entity.ts";
import { PaymentSessionStatus } from "../enums.ts";

const PAYMENT_SESSION_COLUMNS = [
  "id",
  "region",
  "order_id",
  "provider_id",
  "provider_session_id",
  "redirect_url",
  "amount",
  "currency",
  "status",
  "raw_init_payload",
  "raw_last_payload",
  "created_at",
  "updated_at",
];

function toEntity(row: any): PaymentSessionEntity {
  return new PaymentSessionEntity({
    id: Number(row.id),
    region: row.region,
    orderId: Number(row.order_id),
    providerId: Number(row.provider_id),
    providerSessionId: row.provider_session_id,
    redirectUrl: row.redirect_url,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    rawInitPayload: row.raw_init_payload,
    rawLastPayload: row.raw_last_payload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export interface CreatePaymentSessionInput {
  region: string;
  orderId: number;
  providerId: number;
  providerSessionId: string;
  redirectUrl: string;
  amount: number;
  currency: string;
  status: PaymentSessionStatus;
  rawInitPayload: unknown;
}

export async function createPaymentSession(
  conn: Knex,
  data: CreatePaymentSessionInput,
): Promise<PaymentSessionEntity> {
  const [row] = await conn("payment_sessions")
    .insert({
      region: data.region,
      order_id: data.orderId,
      provider_id: data.providerId,
      provider_session_id: data.providerSessionId,
      redirect_url: data.redirectUrl,
      amount: data.amount,
      currency: data.currency,
      status: data.status,
      raw_init_payload: JSON.stringify(data.rawInitPayload),
    })
    .returning(PAYMENT_SESSION_COLUMNS);
  return toEntity(row);
}

export async function findActivePaymentSessionByOrderId(
  conn: Knex,
  orderId: number,
): Promise<PaymentSessionEntity | undefined> {
  const row = await conn("payment_sessions")
    .where("order_id", orderId)
    .whereIn("status", [
      PaymentSessionStatus.INITIALIZED,
      PaymentSessionStatus.PENDING,
    ])
    .orderBy("created_at", "desc")
    .first();
  return row ? toEntity(row) : undefined;
}

export async function findPaymentSessionByProviderSessionId(
  conn: Knex,
  providerSessionId: string,
): Promise<PaymentSessionEntity | undefined> {
  const row = await conn("payment_sessions")
    .where("provider_session_id", providerSessionId)
    .first();
  return row ? toEntity(row) : undefined;
}

export async function updatePaymentSessionStatus(
  conn: Knex,
  id: number,
  status: PaymentSessionStatus,
  rawLastPayload: unknown,
): Promise<PaymentSessionEntity | undefined> {
  const [row] = await conn("payment_sessions")
    .where("id", id)
    .update({
      status,
      raw_last_payload: JSON.stringify(rawLastPayload),
      updated_at: new Date().toISOString(),
    })
    .returning(PAYMENT_SESSION_COLUMNS);
  return row ? toEntity(row) : undefined;
}
