import { DeliveryEntity } from "../entity/delivery.entity.ts";
import { DeliveryStatus } from "../enums.ts";
import type { CoreAgent } from "../../../lib/core-client/agent.client.ts";

export class DeliveryResponseDTO {
  id!: number;
  orderPublicId!: string;
  agent!: { id: number; name: string; phone?: string };
  status!: DeliveryStatus;
  pickup!: { lat: number; lng: number };
  dropoff!: { lat: number; lng: number };
  distanceMeters!: number | null;
  assignedAt!: string;

  static from(
    delivery: DeliveryEntity,
    orderPublicId: string,
    agent: CoreAgent,
  ): DeliveryResponseDTO {
    const dto = new DeliveryResponseDTO();
    dto.id = delivery.id;
    dto.orderPublicId = orderPublicId;
    dto.agent = { id: agent.id, name: agent.name, phone: agent.phone };
    dto.status = delivery.status;
    dto.pickup = { lat: delivery.pickupLat, lng: delivery.pickupLng };
    dto.dropoff = { lat: delivery.dropoffLat, lng: delivery.dropoffLng };
    dto.distanceMeters = delivery.distanceMeters;
    dto.assignedAt = delivery.assignedAt.toISOString();
    return dto;
  }
}

export class DeliveryStatusResponseDTO {
  id!: number;
  status!: DeliveryStatus;
  updatedAt!: string;

  static from(delivery: DeliveryEntity): DeliveryStatusResponseDTO {
    const dto = new DeliveryStatusResponseDTO();
    dto.id = delivery.id;
    dto.status = delivery.status;
    dto.updatedAt = (
      delivery.deliveredAt ??
      delivery.pickedAt ??
      delivery.rejectedAt ??
      delivery.acceptedAt ??
      delivery.assignedAt
    ).toISOString();
    return dto;
  }
}

export class DeliverySummaryResponseDTO {
  id!: number;
  status!: DeliveryStatus;
  agent?: { id: number; name: string; phone?: string };
  assignedAt!: string;
  acceptedAt?: string;
  pickedAt?: string;
  deliveredAt?: string;

  static from(
    delivery: DeliveryEntity,
    agent?: CoreAgent,
  ): DeliverySummaryResponseDTO {
    const dto = new DeliverySummaryResponseDTO();
    dto.id = delivery.id;
    dto.status = delivery.status;
    dto.agent = agent
      ? { id: agent.id, name: agent.name, phone: agent.phone }
      : undefined;
    dto.assignedAt = delivery.assignedAt.toISOString();
    dto.acceptedAt = delivery.acceptedAt?.toISOString();
    dto.pickedAt = delivery.pickedAt?.toISOString();
    dto.deliveredAt = delivery.deliveredAt?.toISOString();
    return dto;
  }
}
