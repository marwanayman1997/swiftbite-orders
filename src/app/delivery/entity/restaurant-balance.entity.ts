export class RestaurantBalanceEntity {
  restaurantId: number;
  region: string;
  currency: string;
  balance: number;
  updatedAt: Date;

  constructor(data: Partial<RestaurantBalanceEntity>) {
    this.restaurantId = data.restaurantId!;
    this.region = data.region!;
    this.currency = data.currency!;
    this.balance = data.balance ?? 0;
    this.updatedAt = data.updatedAt ?? new Date();
  }
}
