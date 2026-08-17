import { injectable } from "tsyringe";
import { db } from "../../../lib/knex/knex.ts";
import { PaginationParams } from "../../../lib/http/pagination/cursor-pagination.ts";
// Finance is a thin read/write veneer over tables owned by other modules
// (restaurant_balances from delivery settlement, transactions from payments)
// — reused directly per the same cross-module repo-import pattern used
// elsewhere, rather than duplicating entities/repos for a read-mostly module.
import {
  findRestaurantBalances,
  lockRestaurantBalance,
  setRestaurantBalance,
} from "../../delivery/repository/restaurant-balance.repo.ts";
import {
  createTransaction,
  findPayouts,
  findTransactionByIdempotencyKey,
  PayoutsPage,
} from "../../payment/repository/transaction.repo.ts";
import {
  TransactionMethod,
  TransactionStatus,
  TransactionType,
} from "../../payment/enums.ts";
import { TransactionEntity } from "../../payment/entity/transaction.entity.ts";
import { RestaurantBalanceEntity } from "../../delivery/entity/restaurant-balance.entity.ts";
import { InsufficientBalanceError } from "../errors.ts";

@injectable()
export class FinanceService {
  getBalance = async (
    region: string,
    restaurantId: number,
  ): Promise<RestaurantBalanceEntity[]> => {
    const conn = db(region);
    return findRestaurantBalances(conn, restaurantId);
  };

  listPayouts = async (
    region: string,
    restaurantId: number,
    from: Date,
    to: Date,
    pagination: PaginationParams,
  ): Promise<PayoutsPage> => {
    const conn = db(region);
    return findPayouts(conn, restaurantId, from, to, pagination);
  };

  recordPayout = async (
    region: string,
    restaurantId: number,
    amount: number,
    currency: string,
    idempotencyKey: string,
  ): Promise<TransactionEntity> => {
    const conn = db(region);
    const scopedKey = `payout:${restaurantId}:${idempotencyKey}`;

    const trx = await conn.transaction();
    try {
      // Locks the balance row first, so a concurrent retry (e.g. the HTTP
      // idempotency cache was cold on both requests) serializes here rather
      // than racing on the existing-transaction check below.
      const locked = await lockRestaurantBalance(
        trx,
        restaurantId,
        region,
        currency,
      );

      const existing = await findTransactionByIdempotencyKey(trx, scopedKey);
      if (existing) {
        await trx.commit();
        return existing;
      }

      if (locked.balance < amount) throw InsufficientBalanceError;

      await setRestaurantBalance(
        trx,
        restaurantId,
        currency,
        locked.balance - amount,
      );

      const tx = await createTransaction(trx, {
        region,
        orderId: null,
        transactionType: TransactionType.PAYOUT,
        method: TransactionMethod.BANK_TRANSFER,
        status: TransactionStatus.SUCCEEDED,
        amount,
        currency,
        srcAccId: null,
        dstAccId: restaurantId,
        idempotencyKey: scopedKey,
      });

      await trx.commit();
      return tx;
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  };
}
