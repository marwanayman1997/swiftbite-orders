import { inject, injectable } from "tsyringe";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../../lib/knex/knex.ts";
import { env } from "../../../lib/config/env.ts";
import { paymentProvider } from "../../../lib/payments/init.ts";
import { toMs } from "../../../pkg/utils/time.ts";
import { AppError } from "../../../lib/error/AppError.ts";
import { logger } from "../../../lib/logger/logger.ts";
import { UnAuthorizedError } from "../../../lib/auth/errors.ts";
import { TOKENS } from "../../../lib/di/tokens.ts";
import { OrderService } from "../../order/service/order.service.ts";
import { OrderStatus } from "../../order/enums.ts";
import { RefundRequestDTO } from "../dto/payment.request.dto.ts";
import {
  PaymentSessionStatus,
  TransactionMethod,
  TransactionStatus,
  TransactionType,
} from "../enums.ts";
import {
  OrderNotPendingPaymentError,
  PaymentAlreadyRefundedError,
  PaymentNotFoundError,
  PaymentNotRefundableError,
} from "../errors.ts";
import { findPaymentProviderByName } from "../repository/payment-provider.repo.ts";
import {
  createPaymentSession,
  findActivePaymentSessionByOrderId,
} from "../repository/payment-session.repo.ts";
import {
  createTransaction,
  findTransactionById,
  markChargeRefunded,
  setTransactionProviderReferenceId,
  updateTransactionStatus,
} from "../repository/transaction.repo.ts";

export interface RequestActor {
  userId: number;
  role: string;
  restaurantId?: number;
  restaurantRole?: string;
}

@injectable()
export class PaymentService {
  constructor(
    @inject(TOKENS.OrderService) private readonly orderService: OrderService,
  ) {}

  init = async (
    orderPublicId: string,
    region: string,
    customerId: number,
    customerEmail: string,
  ) => {
    const order = await this.orderService.findOrderForPayment(
      orderPublicId,
      region,
      customerId,
    );
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw OrderNotPendingPaymentError;
    }

    const conn = db(region);
    const existing = await findActivePaymentSessionByOrderId(conn, order.id);
    if (existing) {
      return existing;
    }

    const kashierProvider = await findPaymentProviderByName(conn, "kashier");
    if (!kashierProvider) {
      throw new AppError("Kashier provider not configured", 500);
    }

    let created;
    try {
      created = await paymentProvider.createSession({
        orderId: order.publicId,
        amountMinor: order.total,
        currency: order.currency,
        // We don't have a real customer-profile lookup in this service (no
        // core-client for it yet) — email is the one piece of real customer
        // identity already on the authenticated request (JwtPayload); name
        // fields are a best-effort placeholder, not shown anywhere but
        // Kashier's own hosted checkout page.
        customer: {
          reference: String(customerId),
          email: customerEmail,
          firstName: customerEmail.split("@")[0] || "Customer",
          lastName: "Customer",
        },
      });
    } catch (err) {
      logger.error("Kashier createSession failed", {
        error: (err as Error).message,
      });
      throw new AppError("Payment provider unavailable", 503);
    }

    const session = await createPaymentSession(conn, {
      region,
      orderId: order.id,
      providerId: kashierProvider.id,
      providerSessionId: created.providerSessionId,
      redirectUrl: created.redirectUrl,
      amount: order.total,
      currency: order.currency,
      status: PaymentSessionStatus.INITIALIZED,
      rawInitPayload: created.raw,
    });

    return session;
  };

  getExpiresAt = (): string => {
    return new Date(
      Date.now() + toMs(env.kashier.sessionTimeoutMin, "m"),
    ).toISOString();
  };

  getById = async (paymentId: number, region: string, actor: RequestActor) => {
    const conn = db(region);
    const transaction = await findTransactionById(conn, paymentId);
    if (!transaction) throw PaymentNotFoundError;

    let order;
    if (transaction.orderId) {
      order = await this.orderService.getOrderEntityById(
        transaction.orderId,
        region,
      );
    }

    if (actor.role !== "system_admin") {
      if (
        !order ||
        actor.role !== "restaurant_user" ||
        Number(actor.restaurantId) !== Number(order.restaurantId)
      ) {
        throw UnAuthorizedError;
      }
    }

    return { transaction, orderPublicId: order?.publicId ?? "" };
  };

  refund = async (
    paymentId: number,
    region: string,
    data: RefundRequestDTO,
  ) => {
    const conn = db(region);
    const charge = await findTransactionById(conn, paymentId);
    if (!charge) throw PaymentNotFoundError;
    if (
      ![TransactionType.CHARGE, TransactionType.COD_COLLECTION].includes(
        charge.transactionType,
      ) ||
      charge.status !== TransactionStatus.SUCCEEDED
    ) {
      throw PaymentNotRefundableError;
    }
    if (charge.isRefunded) throw PaymentAlreadyRefundedError;

    const amount = data.amount ?? charge.amount;

    const refundTransaction = await createTransaction(conn, {
      region,
      orderId: charge.orderId,
      transactionType: TransactionType.REFUND,
      method: charge.method,
      providerId: charge.providerId,
      status: TransactionStatus.PENDING,
      amount,
      currency: charge.currency,
      srcAccId: null,
      dstAccId: charge.srcAccId,
      idempotencyKey: `refund:${uuidv4()}`,
    });

    if (charge.method === TransactionMethod.ONLINE) {
      try {
        const result = await paymentProvider.refund(
          charge.providerReferenceId!,
          amount,
          data.reason,
        );
        await setTransactionProviderReferenceId(
          conn,
          refundTransaction.id,
          result.providerReferenceId,
        );
        // status stays 'pending' until the refund.succeeded webhook confirms it.
      } catch (err) {
        // The Kashier call itself was rejected (not just "pending confirmation")
        // — no webhook will ever arrive to resolve this row, so it must not be
        // left dangling as 'pending' forever.
        await updateTransactionStatus(
          conn,
          refundTransaction.id,
          TransactionStatus.FAILED,
        );
        throw new AppError("Payment provider unavailable", 503);
      }
    } else {
      // COD: cash never reached the platform — bookkeeping only, no external
      // confirmation to wait for.
      const succeeded = await updateTransactionStatus(
        conn,
        refundTransaction.id,
        TransactionStatus.SUCCEEDED,
      );
      await markChargeRefunded(conn, charge.id, refundTransaction.id);
      return succeeded!;
    }

    return refundTransaction;
  };
}
