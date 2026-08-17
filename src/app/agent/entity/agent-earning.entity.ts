export class AgentEarningEntity {
  id: number;
  region: string;
  agentId: number;
  orderId: number;
  deliveryId: number;
  amount: number;
  currency: string;
  earnedAt: Date;

  constructor(data: Partial<AgentEarningEntity>) {
    this.id = data.id!;
    this.region = data.region!;
    this.agentId = data.agentId!;
    this.orderId = data.orderId!;
    this.deliveryId = data.deliveryId!;
    this.amount = data.amount!;
    this.currency = data.currency!;
    this.earnedAt = data.earnedAt ?? new Date();
  }
}
