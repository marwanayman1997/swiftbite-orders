import { RestaurantBalanceEntity } from "../../delivery/entity/restaurant-balance.entity.ts";
import { TransactionEntity } from "../../payment/entity/transaction.entity.ts";

export class RestaurantBalanceResponseDTO {
  restaurantId!: number;
  balances!: { currency: string; amount: number; updatedAt: string }[];

  static from(
    restaurantId: number,
    balances: RestaurantBalanceEntity[],
  ): RestaurantBalanceResponseDTO {
    const dto = new RestaurantBalanceResponseDTO();
    dto.restaurantId = restaurantId;
    dto.balances = balances.map((b) => ({
      currency: b.currency,
      amount: b.balance,
      updatedAt: b.updatedAt.toISOString(),
    }));
    return dto;
  }
}

export class PayoutResponseDTO {
  id!: number;
  restaurantId!: number;
  amount!: number;
  currency!: string;
  status!: string;
  createdAt!: string;

  // dst_acc_id holds the restaurantId for payout transactions.
  static from(tx: TransactionEntity): PayoutResponseDTO {
    const dto = new PayoutResponseDTO();
    dto.id = tx.id;
    dto.restaurantId = tx.dstAccId!;
    dto.amount = tx.amount;
    dto.currency = tx.currency;
    dto.status = tx.status;
    dto.createdAt = tx.createdAt.toISOString();
    return dto;
  }
}
