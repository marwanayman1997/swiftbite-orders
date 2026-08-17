import { DeliveryStatus } from "../enums.ts";

export class DeliveryEntity {
  id: number;
  region: string;
  orderId: number;
  agentId: number;
  status: DeliveryStatus;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  distanceMeters: number | null;
  earningAmount: number | null;
  currency: string;
  assignedAt: Date;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  pickedAt: Date | null;
  deliveredAt: Date | null;
  reassignedAt: Date | null;
  reassignedFrom: number | null;

  constructor(data: Partial<DeliveryEntity>) {
    this.id = data.id!;
    this.region = data.region!;
    this.orderId = data.orderId!;
    this.agentId = data.agentId!;
    this.status = data.status!;
    this.pickupLat = data.pickupLat!;
    this.pickupLng = data.pickupLng!;
    this.dropoffLat = data.dropoffLat!;
    this.dropoffLng = data.dropoffLng!;
    this.distanceMeters = data.distanceMeters ?? null;
    this.earningAmount = data.earningAmount ?? null;
    this.currency = data.currency!;
    this.assignedAt = data.assignedAt ?? new Date();
    this.acceptedAt = data.acceptedAt ?? null;
    this.rejectedAt = data.rejectedAt ?? null;
    this.pickedAt = data.pickedAt ?? null;
    this.deliveredAt = data.deliveredAt ?? null;
    this.reassignedAt = data.reassignedAt ?? null;
    this.reassignedFrom = data.reassignedFrom ?? null;
  }
}
