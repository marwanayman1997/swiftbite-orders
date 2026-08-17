import { DeliveryEntity } from "../../delivery/entity/delivery.entity.ts";
import { DeliveryStatus } from "../../delivery/enums.ts";
import { AgentEarningEntity } from "../entity/agent-earning.entity.ts";
import { OrderEntity } from "../../order/entity/order.entity.ts";

export class DeliveryTaskResponseDTO {
  deliveryId!: number;
  orderPublicId!: string;
  status!: DeliveryStatus;
  pickup!: {
    branchName: string;
    lat: number;
    lng: number;
    addressText: string;
  };
  dropoff!: { lat: number; lng: number; addressText: string };
  itemsCount!: number;
  total!: number;
  currency!: string;
  paymentMethod!: string;
  earningEstimate?: number;
  assignedAt!: string;

  static from(
    delivery: DeliveryEntity,
    order: OrderEntity,
    itemsCount: number,
    branchName: string,
    branchAddressText: string,
  ): DeliveryTaskResponseDTO {
    const dto = new DeliveryTaskResponseDTO();
    dto.deliveryId = delivery.id;
    dto.orderPublicId = order.publicId;
    dto.status = delivery.status;
    dto.pickup = {
      branchName,
      lat: delivery.pickupLat,
      lng: delivery.pickupLng,
      addressText: branchAddressText,
    };
    dto.dropoff = {
      lat: delivery.dropoffLat,
      lng: delivery.dropoffLng,
      addressText: order.deliveryAddressTextSnapshot,
    };
    dto.itemsCount = itemsCount;
    dto.total = order.total;
    dto.currency = order.currency;
    dto.paymentMethod = order.paymentMethod;
    dto.earningEstimate = delivery.earningAmount ?? undefined;
    dto.assignedAt = delivery.assignedAt.toISOString();
    return dto;
  }
}

export interface AgentEarningItem {
  orderPublicId: string;
  amount: number;
  currency: string;
  earnedAt: string;
}

export class AgentEarningsResponseDTO {
  range!: { from: string; to: string };
  totals!: { count: number; sum: number; currency: string };
  items!: AgentEarningItem[];
  nextCursor!: string | null;

  // totals reflects the full date range (a separate aggregate query), not
  // just the current page — the page-level sum would under-report once
  // results span more than one page.
  static from(
    from: string,
    to: string,
    currency: string,
    totals: { count: number; sum: number },
    earnings: AgentEarningEntity[],
    orderPublicIdByEarningId: Map<number, string>,
    nextCursor: string | null,
  ): AgentEarningsResponseDTO {
    const dto = new AgentEarningsResponseDTO();
    dto.range = { from, to };
    dto.items = earnings.map((e) => ({
      orderPublicId: orderPublicIdByEarningId.get(e.id) ?? "",
      amount: e.amount,
      currency: e.currency,
      earnedAt: e.earnedAt.toISOString(),
    }));
    dto.totals = { count: totals.count, sum: totals.sum, currency };
    dto.nextCursor = nextCursor;
    return dto;
  }
}
