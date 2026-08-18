import { Knex } from "knex";
import { inject, injectable } from "tsyringe";
import { v4 as uuidv4 } from "uuid";
import { db } from "../../../lib/knex/knex.ts";
import { env } from "../../../lib/config/env.ts";
import { TOKENS } from "../../../lib/di/tokens.ts";
import { UnAuthorizedError } from "../../../lib/auth/errors.ts";
import { insertOutboxEvent } from "../../../lib/events/outbox.repo.ts";
import { getBranch } from "../../../lib/core-client/branch.client.ts";
import { getAgent } from "../../../lib/core-client/agent.client.ts";
import { OrderService } from "../../order/service/order.service.ts";
import { OrderStatus, PaymentMethod } from "../../order/enums.ts";
import { OrderNotFoundError } from "../../order/errors.ts";
import { AssignmentService } from "./assignment.service.ts";
import { DeliveryEntity } from "../entity/delivery.entity.ts";
import { DeliveryStatus } from "../enums.ts";
import {
  countReassignmentChain,
  findActiveDeliveryByOrderId,
  findDeliveryById,
  setDeliveryEarning,
  updateDeliveryStatus,
} from "../repository/delivery.repo.ts";
import {
  lockRestaurantBalance,
  setRestaurantBalance,
} from "../repository/restaurant-balance.repo.ts";
// Agent earnings live in the agent module (Phase 4) — same direct cross-module
// pattern as the rest of settlement, for the same same-trx/circular-DI reasons.
import { createAgentEarning } from "../../agent/repository/agent-earning.repo.ts";
import {
  MaxReassignmentAttemptsReachedError,
  NoActiveDeliveryError,
  NoEligibleAgentsError,
  OrderAlreadyHasActiveDeliveryError,
  OrderNotReadyError,
  DeliveryNotFoundError,
  invalidDeliveryTransitionError,
} from "../errors.ts";
// Direct cross-module repo access for the money-critical settlement trx —
// see assignment.service.ts's top comment for why (avoids circular DI with
// OrderService, and this write must be atomic with the rest of settlement).
import {
  setOrderCommission,
  updateOrderStatus as updateOrderStatusRepo,
} from "../../order/repository/order.repo.ts";
import {
  createTransaction,
  findPendingCodCollectionByOrderId,
  updateTransactionStatus,
} from "../../payment/repository/transaction.repo.ts";
import {
  TransactionMethod,
  TransactionStatus,
  TransactionType,
} from "../../payment/enums.ts";
import { markAgentFree } from "../../../lib/presence/presence-store.ts";
import { publish } from "../../../lib/websocket/publisher.ts";

const TRANSITIONS: Partial<Record<DeliveryStatus, DeliveryStatus[]>> = {
  [DeliveryStatus.ASSIGNED]: [DeliveryStatus.ACCEPTED, DeliveryStatus.REJECTED],
  [DeliveryStatus.ACCEPTED]: [DeliveryStatus.PICKED],
  [DeliveryStatus.PICKED]: [DeliveryStatus.DELIVERED],
};

@injectable()
export class DeliveryService {
  constructor(
    @inject(TOKENS.OrderService) private readonly orderService: OrderService,
    @inject(TOKENS.AssignmentService)
    private readonly assignmentService: AssignmentService,
  ) {}

  assign = async (orderPublicId: string, region: string, agentId?: number) => {
    const order = await this.orderService.getOrderEntityByPublicId(
      orderPublicId,
      region,
    );
    if (!order) throw OrderNotFoundError;
    if (order.status !== OrderStatus.READY) throw OrderNotReadyError;

    const conn = db(region);
    const existing = await findActiveDeliveryByOrderId(conn, order.id);
    if (existing) throw OrderAlreadyHasActiveDeliveryError;

    const branch = await getBranch(order.branchId);
    const branchCtx = { lat: branch.lat, lng: branch.lng };
    const orderCtx = {
      id: order.id,
      deliveryLat: order.deliveryLat,
      deliveryLng: order.deliveryLng,
      currency: order.currency,
    };

    const delivery = agentId
      ? await this.assignmentService.assignManual(
          conn,
          region,
          orderCtx,
          branchCtx,
          agentId,
        )
      : await this.assignmentService.tryAssign(
          conn,
          region,
          orderCtx,
          branchCtx,
        );

    if (!delivery) throw NoEligibleAgentsError;

    const agent = await getAgent(delivery.agentId);
    return { delivery, agent, orderPublicId: order.publicId };
  };

  // Called from OrderController after a successful ready transition — best
  // effort, never throws (no eligible agent just leaves the order 'ready').
  tryAutoAssign = async (orderId: number, region: string): Promise<void> => {
    const order = await this.orderService.getOrderEntityById(orderId, region);
    if (!order || order.status !== OrderStatus.READY) return;

    const conn = db(region);
    const existing = await findActiveDeliveryByOrderId(conn, order.id);
    if (existing) return;

    const branch = await getBranch(order.branchId);
    await this.assignmentService.tryAssign(
      conn,
      region,
      {
        id: order.id,
        deliveryLat: order.deliveryLat,
        deliveryLng: order.deliveryLng,
        currency: order.currency,
      },
      { lat: branch.lat, lng: branch.lng },
    );
  };

  reassign = async (orderPublicId: string, region: string) => {
    const order = await this.orderService.getOrderEntityByPublicId(
      orderPublicId,
      region,
    );
    if (!order) throw OrderNotFoundError;

    const conn = db(region);
    const active = await findActiveDeliveryByOrderId(conn, order.id);
    if (!active) throw NoActiveDeliveryError;

    const chainLength = await countReassignmentChain(conn, active.id);
    if (chainLength >= env.assignment.maxReassignmentAttempts) {
      throw MaxReassignmentAttemptsReachedError;
    }

    await updateDeliveryStatus(conn, active.id, DeliveryStatus.REASSIGNED);
    await markAgentFree(region, active.agentId).catch(() => {});

    const branch = await getBranch(order.branchId);
    const newDelivery = await this.assignmentService.tryAssign(
      conn,
      region,
      {
        id: order.id,
        deliveryLat: order.deliveryLat,
        deliveryLng: order.deliveryLng,
        currency: order.currency,
      },
      { lat: branch.lat, lng: branch.lng },
      active.id,
    );
    if (!newDelivery) throw NoEligibleAgentsError;

    const agent = await getAgent(newDelivery.agentId);
    return { delivery: newDelivery, agent, orderPublicId: order.publicId };
  };

  updateStatus = async (
    deliveryId: number,
    region: string,
    actorUserId: number,
    targetStatus: DeliveryStatus,
  ): Promise<DeliveryEntity> => {
    const conn = db(region);
    const delivery = await findDeliveryById(conn, deliveryId);
    if (!delivery) throw DeliveryNotFoundError;
    if (Number(delivery.agentId) !== Number(actorUserId))
      throw UnAuthorizedError;

    const allowed = TRANSITIONS[delivery.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw invalidDeliveryTransitionError(delivery.status, targetStatus);
    }

    if (targetStatus === DeliveryStatus.DELIVERED) {
      return this.settleDelivery(conn, region, delivery);
    }

    const updated = await updateDeliveryStatus(conn, deliveryId, targetStatus);

    const order = await this.orderService.getOrderEntityById(
      delivery.orderId,
      region,
    );
    if (order) {
      const payload = {
        deliveryId: delivery.id,
        orderPublicId: order.publicId,
        status: targetStatus,
        updatedAt: new Date().toISOString(),
      };
      publish(
        `customer:${order.customerId}`,
        "delivery.status_changed",
        payload,
      );
      publish(`branch:${order.branchId}`, "delivery.status_changed", payload);
    }

    if (targetStatus === DeliveryStatus.PICKED) {
      await this.orderService.applySystemStatusChange(
        delivery.orderId,
        region,
        OrderStatus.PICKED,
      );
    } else if (targetStatus === DeliveryStatus.REJECTED) {
      await markAgentFree(region, delivery.agentId).catch(() => {});
      await this.tryReassignAfterRejection(conn, region, delivery);
    }

    return updated!;
  };

  private tryReassignAfterRejection = async (
    conn: Knex,
    region: string,
    rejected: DeliveryEntity,
  ): Promise<void> => {
    const chainLength = await countReassignmentChain(conn, rejected.id);
    if (chainLength >= env.assignment.maxReassignmentAttempts) return;

    const order = await this.orderService.getOrderEntityById(
      rejected.orderId,
      region,
    );
    if (!order) return;
    const branch = await getBranch(order.branchId);

    await this.assignmentService.tryAssign(
      conn,
      region,
      {
        id: order.id,
        deliveryLat: order.deliveryLat,
        deliveryLng: order.deliveryLng,
        currency: order.currency,
      },
      { lat: branch.lat, lng: branch.lng },
      rejected.id,
    );
  };

  // Money-critical — everything here happens in one trx (system-design.md §9).
  private settleDelivery = async (
    conn: Knex,
    region: string,
    delivery: DeliveryEntity,
  ): Promise<DeliveryEntity> => {
    const order = await this.orderService.getOrderEntityById(
      delivery.orderId,
      region,
    );
    if (!order) throw OrderNotFoundError;
    const branch = await getBranch(order.branchId);
    const commission = Math.floor(
      (order.subtotal * branch.commissionBps) / 10000,
    );
    // business-logic/deliveries.md §5 step 7: "today simply branch.delivery_fee × agentShareRate".
    const agentEarning = Math.round(
      branch.deliveryFee * env.assignment.agentShareRate,
    );

    const trx = await conn.transaction();
    try {
      const updatedDelivery = await updateDeliveryStatus(
        trx,
        delivery.id,
        DeliveryStatus.DELIVERED,
      );

      await setOrderCommission(trx, order.id, commission);
      await updateOrderStatusRepo(trx, order.id, OrderStatus.DELIVERED);

      if (order.paymentMethod === PaymentMethod.COD) {
        const codTx = await findPendingCodCollectionByOrderId(trx, order.id);
        if (codTx) {
          await updateTransactionStatus(
            trx,
            codTx.id,
            TransactionStatus.SUCCEEDED,
          );
        }
      }
      // Online charges are already 'succeeded' via the payment webhook —
      // nothing to flip here.

      await createTransaction(trx, {
        region,
        orderId: order.id,
        transactionType: TransactionType.COMMISSION,
        method: TransactionMethod.SYSTEM,
        status: TransactionStatus.SUCCEEDED,
        amount: commission,
        currency: order.currency,
        srcAccId: branch.restaurantOwnerId,
        dstAccId: null,
        idempotencyKey: `commission:${delivery.id}`,
      });

      const locked = await lockRestaurantBalance(
        trx,
        order.restaurantId,
        region,
        order.currency,
      );
      await setRestaurantBalance(
        trx,
        order.restaurantId,
        order.currency,
        locked.balance + (order.subtotal - commission),
      );

      await setDeliveryEarning(trx, delivery.id, agentEarning);
      await createAgentEarning(trx, {
        region,
        agentId: delivery.agentId,
        orderId: order.id,
        deliveryId: delivery.id,
        amount: agentEarning,
        currency: order.currency,
      });

      await insertOutboxEvent(trx, {
        aggregateType: "order",
        aggregateId: order.id,
        eventType: "order.status_changed",
        eventId: uuidv4(),
        payload: {
          orderPublicId: order.publicId,
          region,
          restaurantId: order.restaurantId,
          branchId: order.branchId,
          status: OrderStatus.DELIVERED,
          updatedAt: new Date().toISOString(),
          // Lets consumers (analytics-service) attribute this transition back
          // to the day the order was placed, not the day it settled.
          orderCreatedAt: order.createdAt.toISOString(),
          currency: order.currency,
        },
      });
      await insertOutboxEvent(trx, {
        aggregateType: "delivery",
        aggregateId: delivery.id,
        eventType: "delivery.completed",
        eventId: uuidv4(),
        payload: {
          orderPublicId: order.publicId,
          deliveryId: delivery.id,
          agentId: delivery.agentId,
          region,
          deliveredAt: new Date().toISOString(),
        },
      });

      await trx.commit();
      await markAgentFree(region, delivery.agentId).catch(() => {});

      const payload = {
        deliveryId: delivery.id,
        orderPublicId: order.publicId,
        status: DeliveryStatus.DELIVERED,
        updatedAt: new Date().toISOString(),
      };
      publish(
        `customer:${order.customerId}`,
        "delivery.status_changed",
        payload,
      );
      publish(`branch:${order.branchId}`, "delivery.status_changed", payload);

      return updatedDelivery!;
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  };
}
