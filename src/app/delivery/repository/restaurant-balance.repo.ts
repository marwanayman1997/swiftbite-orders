import { Knex } from "knex";
import { RestaurantBalanceEntity } from "../entity/restaurant-balance.entity.ts";

function toEntity(row: any): RestaurantBalanceEntity {
  return new RestaurantBalanceEntity({
    restaurantId: Number(row.restaurant_id),
    region: row.region,
    currency: row.currency,
    balance: Number(row.balance),
    updatedAt: row.updated_at,
  });
}

// Ensures the row exists, then locks it with SELECT ... FOR UPDATE. Must be
// called inside the same trx as the subsequent write (setRestaurantBalance)
// so the lock actually serializes concurrent settlements/payouts.
export async function lockRestaurantBalance(
  conn: Knex,
  restaurantId: number,
  region: string,
  currency: string,
): Promise<RestaurantBalanceEntity> {
  await conn("restaurant_balances")
    .insert({ restaurant_id: restaurantId, region, currency, balance: 0 })
    .onConflict(["restaurant_id", "currency"])
    .ignore();

  const row = await conn("restaurant_balances")
    .where({ restaurant_id: restaurantId, currency })
    .forUpdate()
    .first();
  return toEntity(row);
}

export async function setRestaurantBalance(
  conn: Knex,
  restaurantId: number,
  currency: string,
  balance: number,
): Promise<void> {
  await conn("restaurant_balances")
    .where({ restaurant_id: restaurantId, currency })
    .update({ balance, updated_at: new Date().toISOString() });
}

export async function findRestaurantBalances(
  conn: Knex,
  restaurantId: number,
): Promise<RestaurantBalanceEntity[]> {
  const rows = await conn("restaurant_balances").where({
    restaurant_id: restaurantId,
  });
  return rows.map(toEntity);
}
