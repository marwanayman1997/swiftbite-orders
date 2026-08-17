import { OrderEntity } from "../entity/order.entity.ts";
import { OrderItemEntity } from "../entity/order-item.entity.ts";
import { OrderStatus, PaymentMethod } from "../enums.ts";
import { OrderItemResponseDTO } from "./order-item.response.dto.ts";

export class OrderResponseDTO {
  publicId!: string;
  status!: OrderStatus;
  paymentMethod!: PaymentMethod;
  branch!: { id: number; name: string };
  restaurant!: { id: number; name: string };
  customerAddress!: { lat: number; lng: number; addressText: string };
  subtotal!: number;
  deliveryFee!: number;
  serviceFee!: number;
  total!: number;
  currency!: string;
  items!: OrderItemResponseDTO[];
  createdAt!: string;
  payment?: { sessionId: string; redirectUrl: string };

  static from(
    order: OrderEntity,
    items: OrderItemEntity[],
    branchName: string,
    restaurantName: string,
  ): OrderResponseDTO {
    const dto = new OrderResponseDTO();
    dto.publicId = order.publicId;
    dto.status = order.status;
    dto.paymentMethod = order.paymentMethod;
    dto.branch = { id: order.branchId, name: branchName };
    dto.restaurant = { id: order.restaurantId, name: restaurantName };
    dto.customerAddress = {
      lat: order.deliveryLat,
      lng: order.deliveryLng,
      addressText: order.deliveryAddressTextSnapshot,
    };
    dto.subtotal = order.subtotal;
    dto.deliveryFee = order.deliveryFee;
    dto.serviceFee = order.serviceFee;
    dto.total = order.total;
    dto.currency = order.currency;
    dto.items = items.map(OrderItemResponseDTO.from);
    dto.createdAt = order.createdAt.toISOString();
    return dto;
  }
}

export class OrderSummaryResponseDTO {
  publicId!: string;
  status!: OrderStatus;
  total!: number;
  currency!: string;
  itemsCount!: number;
  restaurant!: { id: number; name: string };
  branchId!: number;
  createdAt!: string;

  static from(
    order: OrderEntity,
    itemsCount: number,
    restaurantName: string,
  ): OrderSummaryResponseDTO {
    const dto = new OrderSummaryResponseDTO();
    dto.publicId = order.publicId;
    dto.status = order.status;
    dto.total = order.total;
    dto.currency = order.currency;
    dto.itemsCount = itemsCount;
    dto.restaurant = { id: order.restaurantId, name: restaurantName };
    dto.branchId = order.branchId;
    dto.createdAt = order.createdAt.toISOString();
    return dto;
  }
}

export class OrderStatusResponseDTO {
  publicId!: string;
  status!: OrderStatus;
  updatedAt!: string;

  static from(order: OrderEntity): OrderStatusResponseDTO {
    const dto = new OrderStatusResponseDTO();
    dto.publicId = order.publicId;
    dto.status = order.status;
    dto.updatedAt = order.updatedAt.toISOString();
    return dto;
  }
}

function buildHistory(
  order: OrderEntity,
): Array<{ status: OrderStatus; ts: string }> {
  const history: Array<{ status: OrderStatus; ts: string }> = [
    { status: OrderStatus.PLACED, ts: order.createdAt.toISOString() },
  ];
  if (order.acceptedAt) {
    history.push({
      status: OrderStatus.ACCEPTED,
      ts: order.acceptedAt.toISOString(),
    });
  }
  if (order.rejectedAt) {
    history.push({
      status: OrderStatus.REJECTED,
      ts: order.rejectedAt.toISOString(),
    });
  }
  if (order.readyAt) {
    history.push({
      status: OrderStatus.READY,
      ts: order.readyAt.toISOString(),
    });
  }
  if (order.assignedAt) {
    history.push({
      status: OrderStatus.ASSIGNED,
      ts: order.assignedAt.toISOString(),
    });
  }
  if (order.pickedAt) {
    history.push({
      status: OrderStatus.PICKED,
      ts: order.pickedAt.toISOString(),
    });
  }
  if (order.deliveredAt) {
    history.push({
      status: OrderStatus.DELIVERED,
      ts: order.deliveredAt.toISOString(),
    });
  }
  if (order.cancelledAt) {
    history.push({
      status: OrderStatus.CANCELLED,
      ts: order.cancelledAt.toISOString(),
    });
  }
  return history;
}

// paymentSummary and delivery are added once the payments (Phase 2) and
// deliveries (Phase 3) tables exist — omitted here rather than faked.
export class OrderDetailResponseDTO extends OrderResponseDTO {
  history!: Array<{ status: OrderStatus; ts: string }>;

  static fromDetail(
    order: OrderEntity,
    items: OrderItemEntity[],
    branchName: string,
    restaurantName: string,
  ): OrderDetailResponseDTO {
    const base = OrderResponseDTO.from(
      order,
      items,
      branchName,
      restaurantName,
    );
    const dto = new OrderDetailResponseDTO();
    Object.assign(dto, base);
    dto.history = buildHistory(order);
    return dto;
  }
}
