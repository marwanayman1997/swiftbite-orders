import { PaymentSessionEntity } from "../entity/payment-session.entity.ts";
import { TransactionEntity } from "../entity/transaction.entity.ts";

export class PaymentInitResponseDTO {
  sessionId!: string;
  providerSessionId!: string;
  redirectUrl!: string;
  expiresAt!: string;
  amount!: number;
  currency!: string;

  static from(
    session: PaymentSessionEntity,
    expiresAt: string,
  ): PaymentInitResponseDTO {
    const dto = new PaymentInitResponseDTO();
    dto.sessionId = String(session.id);
    dto.providerSessionId = session.providerSessionId;
    dto.redirectUrl = session.redirectUrl;
    dto.expiresAt = expiresAt;
    dto.amount = session.amount;
    dto.currency = session.currency;
    return dto;
  }
}

export class PaymentResponseDTO {
  id!: number;
  orderPublicId!: string;
  type!: string;
  method!: string;
  provider?: string;
  providerReferenceId?: string;
  status!: string;
  amount!: number;
  currency!: string;
  isRefunded!: boolean;
  refundedPaymentId?: number;
  createdAt!: string;
  updatedAt!: string;

  static from(
    transaction: TransactionEntity,
    orderPublicId: string,
    providerName?: string,
  ): PaymentResponseDTO {
    const dto = new PaymentResponseDTO();
    dto.id = transaction.id;
    dto.orderPublicId = orderPublicId;
    dto.type = transaction.transactionType;
    dto.method = transaction.method;
    dto.provider = providerName;
    dto.providerReferenceId = transaction.providerReferenceId ?? undefined;
    dto.status = transaction.status;
    dto.amount = transaction.amount;
    dto.currency = transaction.currency;
    dto.isRefunded = transaction.isRefunded;
    dto.refundedPaymentId = transaction.refundedPaymentId ?? undefined;
    dto.createdAt = transaction.createdAt.toISOString();
    dto.updatedAt = transaction.updatedAt.toISOString();
    return dto;
  }
}

export class RefundInitiatedResponseDTO {
  refundId!: number;
  status!: string;
  amount!: number;
  currency!: string;

  static from(transaction: TransactionEntity): RefundInitiatedResponseDTO {
    const dto = new RefundInitiatedResponseDTO();
    dto.refundId = transaction.id;
    dto.status = transaction.status;
    dto.amount = transaction.amount;
    dto.currency = transaction.currency;
    return dto;
  }
}
