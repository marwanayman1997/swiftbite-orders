import { Knex } from "knex";

export interface PaymentProviderRow {
  id: number;
  name: string;
  isEnabled: boolean;
  priority: number;
}

function toEntity(row: any): PaymentProviderRow {
  return {
    id: Number(row.id),
    name: row.name,
    isEnabled: row.is_enabled,
    priority: row.priority,
  };
}

export async function findPaymentProviderByName(
  conn: Knex,
  name: string,
): Promise<PaymentProviderRow | undefined> {
  const row = await conn("payment_providers").where({ name }).first();
  return row ? toEntity(row) : undefined;
}

export async function findPaymentProviderById(
  conn: Knex,
  id: number,
): Promise<PaymentProviderRow | undefined> {
  const row = await conn("payment_providers").where({ id }).first();
  return row ? toEntity(row) : undefined;
}
