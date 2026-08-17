import { Knex } from "knex";
import { inject, injectable } from "tsyringe";
import { db } from "../../../lib/knex/knex.ts";
import { paymentProvider } from "../../../lib/payments/init.ts";
import { AppError } from "../../../lib/error/AppError.ts";
import { TOKENS } from "../../../lib/di/tokens.ts";
import { OrderService } from "../../order/service/order.service.ts";
import { OrderStatus } from "../../order/enums.ts";
import { InvalidSignatureError } from "../errors.ts";
import {
  TransactionMethod,
  TransactionStatus,
  TransactionType,
} from "../enums.ts";
import { PaymentSessionStatus } from "../enums.ts";
import {
  findActivePaymentSessionByOrderId,
  updatePaymentSessionStatus,
} from "../repository/payment-session.repo.ts";
import {
  createTransaction,
  findPendingRefundByProviderReferenceId,
  findSucceededChargeByOrderId,
  markChargeRefunded,
  updateTransactionStatus,
} from "../repository/transaction.repo.ts";
import {
  markWebhookEventProcessed,
  recordWebhookEventIfNew,
} from "../repository/payment-webhook-event.repo.ts";
import { findPaymentProviderByName } from "../repository/payment-provider.repo.ts";
import { REGIONS } from "../../../lib/sharding/regions.ts";
import { publish } from "../../../lib/websocket/publisher.ts";
import type { OrderEntity } from "../../order/entity/order.entity.ts";

// Kashier's webhook payload doesn't carry our internal payment_session id —
// only `merchantOrderId` (our order's publicId, which we set as `order` on
// session creation). We resolve the session via the order instead of
// assuming a specific Kashier-side session field, which keeps this robust
// to fields we couldn't confirm from their docs.
//
// The webhook also carries no X-Region — Kashier has no notion of our
// sharding. We resolve the region with a small bounded fan-out across the
// (currently 2) configured regions. This is a deliberate, narrow exception
// to the "no cross-shard reads" rule: it's an external callback, not a
// customer-facing hot path, and the fan-out is O(REGIONS.length) with an
// indexed public_id lookup per shard.
@injectable()
export class KashierWebhookService {
  constructor(
    @inject(TOKENS.OrderService) private readonly orderService: OrderService,
  ) {}

  process = async (
    rawPayload: Record<string, unknown>,
    signature: string,
  ): Promise<void> => {
    if (!paymentProvider.verifyWebhook(rawPayload, signature)) {
      throw InvalidSignatureError;
    }

    // Real Kashier envelope, confirmed against a live payload:
    // { platform, event, data: { merchantOrderId, status, transactionId, ... } }
    // — event lives at the top level, everything else under `data`. The
    // original code assumed a flat payload; fixed after capturing and
    // inspecting an actual webhook call (see kashier.client.ts's
    // verifyWebhook for the matching signature-verification fix).
    const data = (rawPayload.data as Record<string, unknown>) ?? {};
    const event = String(rawPayload.event ?? "");
    const status = String(data.status ?? "");
    const merchantOrderId = String(data.merchantOrderId ?? "");
    const providerTransactionId = String(
      data.transactionId ?? data.kashierOrderId ?? "",
    );
    const providerEventId = `${providerTransactionId}:${event}:${status}`;

    const region = await this.resolveRegion(merchantOrderId);
    if (!region) return; // unknown order — nothing to reconcile, ack anyway

    const conn = db(region);
    const kashierProvider = await findPaymentProviderByName(conn, "kashier");
    if (!kashierProvider) {
      throw new AppError("Kashier provider not configured", 500);
    }

    const trx = await conn.transaction();
    let webhookEventId: number | null = null;
    let payOutcome:
      { result: "captured" | "failed"; order: OrderEntity } | undefined;
    try {
      const recorded = await recordWebhookEventIfNew(trx, {
        region,
        providerId: kashierProvider.id,
        providerEventId,
        signature,
        payload: rawPayload,
      });

      if (!recorded) {
        // Already processed (or in flight) — ack without reprocessing.
        await trx.commit();
        return;
      }
      webhookEventId = recorded.id;

      if (event === "pay") {
        payOutcome = await this.handlePayEvent(
          trx,
          region,
          merchantOrderId,
          providerTransactionId,
          status,
          rawPayload,
        );
      } else if (event === "refund") {
        await this.handleRefundEvent(trx, providerTransactionId, status);
      }

      await markWebhookEventProcessed(trx, webhookEventId, null);
      await trx.commit();

      // Published after commit — never inside the trx (system-design.md §11:
      // WS fan-out is best-effort and must never gate a DB write).
      if (payOutcome?.result === "captured") {
        publish(
          `customer:${payOutcome.order.customerId}`,
          "order.status_changed",
          {
            orderPublicId: payOutcome.order.publicId,
            status: OrderStatus.PLACED,
          },
        );
        publish(`branch:${payOutcome.order.branchId}`, "order.created", {
          orderPublicId: payOutcome.order.publicId,
          branchId: payOutcome.order.branchId,
          total: payOutcome.order.total,
          currency: payOutcome.order.currency,
          paymentMethod: payOutcome.order.paymentMethod,
          createdAt: payOutcome.order.createdAt.toISOString(),
        });
      } else if (payOutcome?.result === "failed") {
        publish(`customer:${payOutcome.order.customerId}`, "payment.failed", {
          orderPublicId: payOutcome.order.publicId,
        });
      }
    } catch (err) {
      await trx.rollback();
      if (webhookEventId) {
        // best-effort — record the failure outside the rolled-back trx so a
        // retry isn't silently swallowed without a trace
        await markWebhookEventProcessed(
          db(region),
          webhookEventId,
          (err as Error).message,
        ).catch(() => {});
      }
      throw err;
    }
  };

  private resolveRegion = async (
    merchantOrderId: string,
  ): Promise<string | undefined> => {
    if (!merchantOrderId) return undefined;
    for (const region of REGIONS) {
      const order = await this.orderService.getOrderEntityByPublicId(
        merchantOrderId,
        region,
      );
      if (order) return region;
    }
    return undefined;
  };

  private handlePayEvent = async (
    trx: Knex.Transaction,
    region: string,
    merchantOrderId: string,
    providerTransactionId: string,
    status: string,
    rawPayload: Record<string, unknown>,
  ): Promise<
    { result: "captured" | "failed"; order: OrderEntity } | undefined
  > => {
    const order = await this.orderService.getOrderEntityByPublicId(
      merchantOrderId,
      region,
    );
    if (!order) return undefined; // unknown order — nothing to reconcile

    const session = await findActivePaymentSessionByOrderId(trx, order.id);
    if (!session) return undefined;

    if (status === "SUCCESS") {
      await updatePaymentSessionStatus(
        trx,
        session.id,
        PaymentSessionStatus.CAPTURED,
        rawPayload,
      );

      await createTransaction(trx, {
        region,
        orderId: order.id,
        transactionType: TransactionType.CHARGE,
        method: TransactionMethod.ONLINE,
        providerId: session.providerId,
        providerReferenceId: providerTransactionId,
        status: TransactionStatus.SUCCEEDED,
        amount: session.amount,
        currency: session.currency,
        srcAccId: order.customerId,
        dstAccId: null,
        idempotencyKey: `charge:${providerTransactionId}`,
      });

      await this.orderService.applySystemStatusChange(
        order.id,
        region,
        OrderStatus.PLACED,
      );
      return { result: "captured", order };
    } else {
      await updatePaymentSessionStatus(
        trx,
        session.id,
        PaymentSessionStatus.FAILED,
        rawPayload,
      );

      await createTransaction(trx, {
        region,
        orderId: order.id,
        transactionType: TransactionType.CHARGE,
        method: TransactionMethod.ONLINE,
        providerId: session.providerId,
        providerReferenceId: providerTransactionId,
        status: TransactionStatus.FAILED,
        amount: session.amount,
        currency: session.currency,
        srcAccId: order.customerId,
        dstAccId: null,
        idempotencyKey: `charge:${providerTransactionId}`,
      });
      // order.status stays pending_payment — eligible for retry.
      return { result: "failed", order };
    }
  };

  private handleRefundEvent = async (
    trx: Knex.Transaction,
    providerTransactionId: string,
    status: string,
  ): Promise<void> => {
    if (status !== "SUCCESS") return;

    const refund = await findPendingRefundByProviderReferenceId(
      trx,
      providerTransactionId,
    );
    if (!refund || !refund.orderId) return;

    await updateTransactionStatus(trx, refund.id, TransactionStatus.SUCCEEDED);

    const charge = await findSucceededChargeByOrderId(trx, refund.orderId);
    if (charge) {
      await markChargeRefunded(trx, charge.id, refund.id);
    }
    // Restaurant balance adjustment for already-delivered orders lands in
    // Phase 3 once restaurant_balances exists.
  };
}
