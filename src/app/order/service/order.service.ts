import { injectable } from "tsyringe";
import { v4 as uuidv4 } from "uuid";
import { Knex } from "knex";
import { db, dbArchive } from "../../../lib/knex/knex.ts";
import {
  getBranch,
  getBranchProducts,
  reserveStock,
} from "../../../lib/core-client/branch.client.ts";
import { getCustomerAddress } from "../../../lib/core-client/address.client.ts";
import { CreateOrderRequestDTO } from "../dto/order.request.dto.ts";
import {
  createOrder,
  findOrderById as findOrderEntityById,
  findOrderByPublicId,
  findOrdersByBranch,
  findOrdersByCustomer,
  updateOrderStatus,
} from "../repository/order.repo.ts";
import type { OrderEntity } from "../entity/order.entity.ts";
import {
  bulkInsertItems,
  findItemsByOrderIds,
} from "../repository/order-item.repo.ts";
import { OrderStatus, PaymentMethod } from "../enums.ts";
import { assertTransition, OrderActor } from "./order-status.service.ts";
import {
  AddressNotOwnedError,
  BranchNotAcceptingOrdersError,
  CancellationWindowExpiredError,
  OrderNotFoundError,
  outOfStockError,
} from "../errors.ts";
import { UnAuthorizedError } from "../../../lib/auth/errors.ts";
import {
  getPermissions,
  hasPermission,
} from "../../../lib/auth/permission-cache.ts";
// Direct payment-module repo access (not via PaymentService) is deliberate
// here: the COD collection row must be written in the exact same DB trx as
// the order+items insert (business-logic/orders.md §2 step 6), and
// PaymentService already depends on OrderService — injecting OrderService
// into PaymentService too would create a circular DI dependency.
import { createTransaction } from "../../payment/repository/transaction.repo.ts";
import { findPaymentProviderByName } from "../../payment/repository/payment-provider.repo.ts";
import {
  TransactionMethod,
  TransactionStatus,
  TransactionType,
} from "../../payment/enums.ts";
// Same direct-repo-access justification as above — cancelling the delivery
// must land in the same trx as the order's own cancellation.
import { cancelActiveDeliveryForOrder } from "../../delivery/repository/delivery.repo.ts";
import { markAgentFree } from "../../../lib/presence/presence-store.ts";
import { publish } from "../../../lib/websocket/publisher.ts";
import { insertOutboxEvent } from "../../../lib/events/outbox.repo.ts";
import type {
  FilterParams,
  PaginationMeta,
  PaginationParams,
} from "../../../lib/http/pagination/cursor-pagination.ts";

// Phase 7 (archival): a prior-year order lives in dbArchive(region), not
// db(region), once the nightly worker has moved it. See
// lib/jobs/archival.worker.ts for the move itself.
type DateRangeLocation = "hot" | "archive" | "straddle";

function currentYearStart(): Date {
  return new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
}

// Inspects the parsed created_at gte/lte filters already supported by
// parseFilters/ORDER_FILTER_FIELDS (order.controller.ts) to decide which
// connection(s) a restaurant-orders query needs to hit. Only a *fully*
// bounded range (both gte and lte supplied) can be classified as entirely
// archive or straddling — a one-sided or unbounded filter is treated as hot
// only, matching pre-archival behavior. Since hot naturally holds only
// current-year rows once the nightly worker has run, an unbounded query
// already returns everything hot actually has; this is a deliberate
// simplification for what the plan calls "a rare path," not a gap — a
// caller that wants guaranteed prior-year inclusion should supply both
// bounds explicitly.
function classifyDateRange(filters: FilterParams[]): DateRangeLocation {
  const yearStart = currentYearStart();
  const upper = filters.find(
    (f) =>
      f.field === "created_at" && (f.operator === "lte" || f.operator === "lt"),
  );
  const lower = filters.find(
    (f) =>
      f.field === "created_at" && (f.operator === "gte" || f.operator === "gt"),
  );

  if (!upper || !lower) return "hot";

  const upperDate = new Date(upper.value as string);
  const lowerDate = new Date(lower.value as string);
  if (upperDate < yearStart) return "archive";
  if (lowerDate >= yearStart) return "hot";
  return "straddle";
}

// Target status -> required RBAC permission for a restaurant_user actor
// (business-logic/orders.md §11).
const STATUS_PERMISSION: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.ACCEPTED]: "accept",
  [OrderStatus.REJECTED]: "accept",
  [OrderStatus.PREPARING]: "update",
  [OrderStatus.READY]: "update",
  [OrderStatus.CANCELLED]: "cancel",
};

const CANCELLATION_WINDOW_MS = 60 * 1000;

export interface RequestActor {
  userId: number;
  role: string;
  restaurantId?: number;
  restaurantRole?: string;
  branchIds?: number[];
}

@injectable()
export class OrderService {
  placeOrder = async (customerId: number, data: CreateOrderRequestDTO) => {
    // The order always goes to the branch's own region shard, per
    // business-logic/orders.md §2 step 1 — the client's resolved region (if
    // any) is not authoritative here.
    const branch = await getBranch(data.branchId);
    const region = branch.region;

    if (!branch.acceptOrders || branch.restaurantStatus !== "active") {
      throw BranchNotAcceptingOrdersError;
    }

    const address = await getCustomerAddress(data.customerAddressId);
    if (Number(address.userId) !== Number(customerId)) {
      throw AddressNotOwnedError;
    }

    const productIds = data.items.map((item) => item.productId);
    const branchProducts = await getBranchProducts(data.branchId, productIds);

    const shortfalls: Array<{
      productId: number;
      requested: number;
      available: number;
    }> = [];
    for (const item of data.items) {
      const product = branchProducts.find(
        (p) => p.productId === item.productId,
      );
      if (!product || !product.isAvailable || product.stock < item.quantity) {
        shortfalls.push({
          productId: item.productId,
          requested: item.quantity,
          available: product?.stock ?? 0,
        });
      }
    }
    if (shortfalls.length > 0) {
      throw outOfStockError(shortfalls);
    }

    const subtotal = data.items.reduce((sum, item) => {
      const product = branchProducts.find(
        (p) => p.productId === item.productId,
      )!;
      return sum + product.price * item.quantity;
    }, 0);
    const deliveryFee = branch.deliveryFee;
    const serviceFee = 0;
    const total = subtotal + deliveryFee + serviceFee;

    const publicId = uuidv4();
    const conn = db(region);
    const trx = await conn.transaction();
    let order;
    let items;
    try {
      order = await createOrder(trx, {
        region,
        publicId,
        countryCode: region.toUpperCase(),
        restaurantId: branch.restaurantId,
        branchId: data.branchId,
        customerId,
        customerAddressId: data.customerAddressId,
        deliveryLat: address.lat,
        deliveryLng: address.lng,
        deliveryAddressTextSnapshot: address.addressText,
        status:
          data.paymentMethod === PaymentMethod.ONLINE
            ? OrderStatus.PENDING_PAYMENT
            : OrderStatus.PLACED,
        subtotal,
        deliveryFee,
        serviceFee,
        total,
        currency: branch.currency,
        paymentMethod: data.paymentMethod,
      });

      items = await bulkInsertItems(
        trx,
        region,
        order.id,
        data.items.map((item) => {
          const product = branchProducts.find(
            (p) => p.productId === item.productId,
          )!;
          return {
            productId: item.productId,
            quantity: item.quantity,
            unitPriceSnapshot: product.price,
            nameSnapshot: product.name,
            imageUrlSnapshot: product.imageUrl,
            lineTotal: product.price * item.quantity,
          };
        }),
      );

      if (data.paymentMethod === PaymentMethod.COD) {
        const codProvider = await findPaymentProviderByName(trx, "cod");
        await createTransaction(trx, {
          region,
          orderId: order.id,
          transactionType: TransactionType.COD_COLLECTION,
          method: TransactionMethod.COD,
          providerId: codProvider?.id ?? null,
          status: TransactionStatus.PENDING,
          amount: total,
          currency: branch.currency,
          srcAccId: customerId,
          dstAccId: branch.restaurantOwnerId,
        });

        // COD orders are "real" the moment they're placed — the equivalent
        // online-payment event fires from kashier-webhook.service.ts instead,
        // once the charge actually captures (see handlePayEvent).
        await insertOutboxEvent(trx, {
          aggregateType: "order",
          aggregateId: order.id,
          eventType: "order.placed",
          eventId: uuidv4(),
          payload: {
            orderPublicId: order.publicId,
            region,
            restaurantId: order.restaurantId,
            branchId: order.branchId,
            subtotal: order.subtotal,
            deliveryFee: order.deliveryFee,
            total: order.total,
            currency: order.currency,
            paymentMethod: order.paymentMethod,
            status: order.status,
            createdAt: order.createdAt.toISOString(),
            items: items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPriceSnapshot: item.unitPriceSnapshot,
              lineTotal: item.lineTotal,
            })),
          },
        });
      }

      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    // implementation-plan.md Phase 6 item 1: COD publishes order.created to
    // the branch right after commit; online payment defers this to
    // payment.captured (kashier-webhook.service.ts) since the order isn't
    // real to the restaurant until it's actually paid for.
    if (data.paymentMethod === PaymentMethod.COD) {
      publish(`branch:${data.branchId}`, "order.created", {
        orderPublicId: order.publicId,
        branchId: data.branchId,
        total: order.total,
        currency: order.currency,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt.toISOString(),
      });
    }

    // Stock reservation is out-of-trx, after commit (business-logic/orders.md
    // §2 step 6) — stock was last verified seconds ago via getBranchProducts.
    try {
      await reserveStock(
        data.branchId,
        data.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        publicId,
      );
    } catch (err) {
      await updateOrderStatus(conn, order.id, OrderStatus.CANCELLED);
      throw err;
    }

    return {
      order,
      items,
      branchLabel: branch.label,
      restaurantName: branch.restaurantName,
    };
  };

  getOrder = async (publicId: string, region: string, actor: RequestActor) => {
    let conn: Knex = db(region);
    let order = await findOrderByPublicId(conn, publicId);

    // Phase 7: archive fallback gated to system_admin only — ordinary
    // customer/owner lookups stay hot-only (this is the live-tracking path,
    // not a history browse; those already route correctly via
    // listCustomerOrders/listRestaurantOrders).
    if (!order && actor.role === "system_admin") {
      conn = dbArchive(region);
      order = await findOrderByPublicId(conn, publicId);
    }
    if (!order) throw OrderNotFoundError;

    this.assertReadAccess(
      order.customerId,
      order.restaurantId,
      order.branchId,
      actor,
    );

    const items = await findItemsByOrderIds(conn, [order.id]);
    const branch = await getBranch(order.branchId);

    return {
      order,
      items,
      branchLabel: branch.label,
      restaurantName: branch.restaurantName,
    };
  };

  // Narrow cross-module accessors for other modules (payments, deliveries) —
  // CLAUDE.md forbids reaching into another module's repository directly.
  findOrderForPayment = async (
    publicId: string,
    region: string,
    customerId: number,
  ): Promise<OrderEntity> => {
    const conn = db(region);
    const order = await findOrderByPublicId(conn, publicId);
    if (!order || Number(order.customerId) !== Number(customerId)) {
      throw OrderNotFoundError;
    }
    return order;
  };

  getOrderEntityById = async (
    id: number,
    region: string,
  ): Promise<OrderEntity | undefined> => {
    return findOrderEntityById(db(region), id);
  };

  // System-level lookup with no ownership check — the webhook handler is
  // authenticated by the provider's signature, not by an acting user.
  getOrderEntityByPublicId = async (
    publicId: string,
    region: string,
  ): Promise<OrderEntity | undefined> => {
    return findOrderByPublicId(db(region), publicId);
  };

  // System-driven transitions (webhooks) bypass actor-based RBAC — the
  // caller (kashier-webhook.service.ts) is itself gated by signature
  // verification, not user auth.
  applySystemStatusChange = async (
    id: number,
    region: string,
    targetStatus: OrderStatus,
    trx?: Knex,
  ): Promise<OrderEntity> => {
    const updated = await updateOrderStatus(trx ?? db(region), id, targetStatus);
    if (!updated) throw OrderNotFoundError;
    return updated;
  };

  listCustomerOrders = async (
    customerId: number,
    region: string,
    year: number,
    pagination: PaginationParams,
  ) => {
    // Phase 7: a single year is either entirely archived or entirely still
    // in hot — no straddling case exists here (unlike the from/to range in
    // listRestaurantOrders). Unconditional switch, no hot-fallback — only
    // safe once archive DBs exist, are migrated, and a run has completed.
    const conn =
      year < new Date().getUTCFullYear() ? dbArchive(region) : db(region);
    const { data: orders, meta } = await findOrdersByCustomer(
      conn,
      customerId,
      year,
      pagination,
    );

    const orderIds = orders.map((o) => o.id);
    const items = await findItemsByOrderIds(conn, orderIds);
    const itemsByOrder = new Map<number, number>();
    for (const item of items) {
      itemsByOrder.set(item.orderId, (itemsByOrder.get(item.orderId) ?? 0) + 1);
    }

    const restaurantNames = new Map<number, string>();
    for (const order of orders) {
      if (!restaurantNames.has(order.branchId)) {
        const branch = await getBranch(order.branchId);
        restaurantNames.set(order.branchId, branch.restaurantName);
      }
    }

    return {
      data: orders.map((order) => ({
        order,
        itemsCount: itemsByOrder.get(order.id) ?? 0,
        restaurantName: restaurantNames.get(order.branchId) ?? "",
      })),
      meta,
    };
  };

  listRestaurantOrders = async (
    branchId: number,
    region: string,
    filters: FilterParams[],
    pagination: PaginationParams,
    actor: RequestActor,
  ) => {
    // requireBranchAccess's owner-bypass doesn't verify the branch belongs to
    // the actor's own restaurant (there's no restaurantId route param here to
    // pre-check it) — verified independently against live branch data.
    const branch = await getBranch(branchId);
    if (
      actor.role !== "system_admin" &&
      !(
        actor.role === "restaurant_user" &&
        Number(actor.restaurantId) === Number(branch.restaurantId) &&
        (actor.restaurantRole === "owner" ||
          (actor.branchIds ?? []).includes(branchId))
      )
    ) {
      throw UnAuthorizedError;
    }

    // Phase 7: route to hot, archive, or (rare) both, based on the parsed
    // created_at bounds — see classifyDateRange's own comment for exactly
    // what counts as "straddling".
    const location = classifyDateRange(filters);

    if (location !== "straddle") {
      const conn = location === "archive" ? dbArchive(region) : db(region);
      const { data: orders, meta } = await findOrdersByBranch(
        conn,
        branchId,
        filters,
        pagination,
      );
      const itemsByOrder = await this.countItemsByOrder(
        conn,
        orders.map((o) => o.id),
      );

      return {
        data: orders.map((order) => ({
          order,
          itemsCount: itemsByOrder.get(order.id) ?? 0,
          restaurantName: branch.restaurantName,
        })),
        meta,
      };
    }

    // Straddling range: fan out to both connections and merge in-memory.
    // orders.id is a per-database sequence — hot id 500 and archive id 500
    // are unrelated rows — so the items lookup below must run separately
    // per source, against its own connection, never mixing the two id sets.
    // Cursor pagination isn't composable across two independent DBs, so an
    // incoming cursor is ignored here; this is a documented restriction on
    // this intentionally rare path, not a bug.
    const [hotPage, archivePage] = await Promise.all([
      findOrdersByBranch(db(region), branchId, filters, {
        ...pagination,
        cursor: undefined,
      }),
      findOrdersByBranch(dbArchive(region), branchId, filters, {
        ...pagination,
        cursor: undefined,
      }),
    ]);
    const [hotItemsByOrder, archiveItemsByOrder] = await Promise.all([
      this.countItemsByOrder(
        db(region),
        hotPage.data.map((o) => o.id),
      ),
      this.countItemsByOrder(
        dbArchive(region),
        archivePage.data.map((o) => o.id),
      ),
    ]);

    const sortDir = pagination.sortOrder === "asc" ? 1 : -1;
    const combined = [
      ...hotPage.data.map((order) => ({
        order,
        itemsCount: hotItemsByOrder.get(order.id) ?? 0,
      })),
      ...archivePage.data.map((order) => ({
        order,
        itemsCount: archiveItemsByOrder.get(order.id) ?? 0,
      })),
    ].sort(
      (a, b) =>
        sortDir * (a.order.createdAt.getTime() - b.order.createdAt.getTime()),
    );

    const page = combined.slice(0, pagination.limit);
    const meta: PaginationMeta = {
      nextCursor: null,
      hasMore: combined.length > pagination.limit,
      count: page.length,
    };

    return {
      data: page.map(({ order, itemsCount }) => ({
        order,
        itemsCount,
        restaurantName: branch.restaurantName,
      })),
      meta,
    };
  };

  private countItemsByOrder = async (
    conn: Knex,
    orderIds: number[],
  ): Promise<Map<number, number>> => {
    const items = await findItemsByOrderIds(conn, orderIds);
    const itemsByOrder = new Map<number, number>();
    for (const item of items) {
      itemsByOrder.set(item.orderId, (itemsByOrder.get(item.orderId) ?? 0) + 1);
    }
    return itemsByOrder;
  };

  updateStatus = async (
    publicId: string,
    region: string,
    targetStatus: OrderStatus,
    actor: RequestActor,
    reason: string | undefined,
  ) => {
    const conn = db(region);
    const order = await findOrderByPublicId(conn, publicId);
    if (!order) throw OrderNotFoundError;

    const orderActor = await this.resolveActor(order, actor, targetStatus);
    assertTransition(order.status, targetStatus, orderActor);

    if (targetStatus === OrderStatus.CANCELLED && orderActor === "customer") {
      const withinWindow =
        order.status === OrderStatus.PENDING_PAYMENT ||
        (order.status === OrderStatus.PLACED &&
          Date.now() - order.createdAt.getTime() <= CANCELLATION_WINDOW_MS);
      if (!withinWindow) {
        throw CancellationWindowExpiredError;
      }
    }

    // Status write + outbox row must land atomically (CLAUDE.md §8) — the
    // downstream delivery-cancel/agent-free steps below stay outside this
    // trx, matching their pre-existing (already non-transactional) timing.
    const trx = await conn.transaction();
    let updated: OrderEntity | undefined;
    try {
      updated = await updateOrderStatus(trx, order.id, targetStatus);
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
          status: targetStatus,
          updatedAt: updated!.updatedAt.toISOString(),
          // Lets consumers (analytics-service) attribute this transition back
          // to the day the order was placed, not the day it changed status.
          orderCreatedAt: order.createdAt.toISOString(),
          currency: order.currency,
        },
      });
      await trx.commit();
    } catch (err) {
      await trx.rollback();
      throw err;
    }

    if (
      targetStatus === OrderStatus.CANCELLED &&
      order.status === OrderStatus.ASSIGNED
    ) {
      const freedAgentId = await cancelActiveDeliveryForOrder(conn, order.id);
      if (freedAgentId) {
        await markAgentFree(region, freedAgentId).catch(() => {});
      }
    }

    const statusPayload = {
      orderPublicId: order.publicId,
      status: targetStatus,
      updatedAt: updated!.updatedAt.toISOString(),
    };
    publish(
      `customer:${order.customerId}`,
      "order.status_changed",
      statusPayload,
    );
    publish(`branch:${order.branchId}`, "order.status_changed", statusPayload);

    return updated!;
  };

  private assertReadAccess(
    customerId: number,
    restaurantId: number,
    branchId: number,
    actor: RequestActor,
  ): void {
    if (actor.role === "system_admin") return;
    if (
      actor.role === "customer" &&
      Number(actor.userId) === Number(customerId)
    )
      return;
    if (
      actor.role === "restaurant_user" &&
      Number(actor.restaurantId) === Number(restaurantId) &&
      (actor.restaurantRole === "owner" ||
        (actor.branchIds ?? []).includes(branchId))
    ) {
      return;
    }
    throw UnAuthorizedError;
  }

  private async resolveActor(
    order: { customerId: number; restaurantId: number; branchId: number },
    actor: RequestActor,
    targetStatus: OrderStatus,
  ): Promise<OrderActor> {
    if (actor.role === "system_admin") return "admin";
    if (actor.role === "customer") {
      if (Number(actor.userId) !== Number(order.customerId))
        throw UnAuthorizedError;
      return "customer";
    }
    if (actor.role === "restaurant_user") {
      if (
        Number(actor.restaurantId) !== Number(order.restaurantId) ||
        (actor.restaurantRole !== "owner" &&
          !(actor.branchIds ?? []).includes(order.branchId))
      ) {
        throw UnAuthorizedError;
      }

      const requiredAction = STATUS_PERMISSION[targetStatus];
      if (requiredAction) {
        const permissions = await getPermissions(actor.restaurantRole!);
        if (!hasPermission(permissions, "orders", requiredAction)) {
          throw UnAuthorizedError;
        }
      }
      return "restaurant";
    }
    throw UnAuthorizedError;
  }
}
