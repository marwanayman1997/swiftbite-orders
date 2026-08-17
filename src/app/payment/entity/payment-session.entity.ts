import { PaymentSessionStatus } from "../enums.ts";

export class PaymentSessionEntity {
  id: number;
  region: string;
  orderId: number;
  providerId: number;
  providerSessionId: string;
  redirectUrl: string;
  amount: number;
  currency: string;
  status: PaymentSessionStatus;
  rawInitPayload: unknown;
  rawLastPayload: unknown | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(data: Partial<PaymentSessionEntity>) {
    this.id = data.id!;
    this.region = data.region!;
    this.orderId = data.orderId!;
    this.providerId = data.providerId!;
    this.providerSessionId = data.providerSessionId!;
    this.redirectUrl = data.redirectUrl!;
    this.amount = data.amount!;
    this.currency = data.currency!;
    this.status = data.status!;
    this.rawInitPayload = data.rawInitPayload;
    this.rawLastPayload = data.rawLastPayload ?? null;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }
}
