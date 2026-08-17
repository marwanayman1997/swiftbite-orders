import { OrderStatus, PaymentMethod } from "../enums.ts";

export class OrderEntity {
  id: number;
  region: string;
  publicId: string;
  countryCode: string;
  restaurantId: number;
  branchId: number;
  customerId: number;
  customerAddressId: number;
  deliveryLat: number;
  deliveryLng: number;
  deliveryAddressTextSnapshot: string;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  total: number;
  commission: number;
  currency: string;
  paymentMethod: PaymentMethod;
  deliveryAgentId: number | null;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  readyAt: Date | null;
  assignedAt: Date | null;
  pickedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;

  constructor(data: Partial<OrderEntity>) {
    this.id = data.id!;
    this.region = data.region!;
    this.publicId = data.publicId!;
    this.countryCode = data.countryCode!;
    this.restaurantId = data.restaurantId!;
    this.branchId = data.branchId!;
    this.customerId = data.customerId!;
    this.customerAddressId = data.customerAddressId!;
    this.deliveryLat = data.deliveryLat!;
    this.deliveryLng = data.deliveryLng!;
    this.deliveryAddressTextSnapshot = data.deliveryAddressTextSnapshot!;
    this.status = data.status!;
    this.subtotal = data.subtotal!;
    this.deliveryFee = data.deliveryFee!;
    this.serviceFee = data.serviceFee!;
    this.total = data.total!;
    this.commission = data.commission ?? 0;
    this.currency = data.currency!;
    this.paymentMethod = data.paymentMethod!;
    this.deliveryAgentId = data.deliveryAgentId ?? null;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
    this.acceptedAt = data.acceptedAt ?? null;
    this.rejectedAt = data.rejectedAt ?? null;
    this.readyAt = data.readyAt ?? null;
    this.assignedAt = data.assignedAt ?? null;
    this.pickedAt = data.pickedAt ?? null;
    this.deliveredAt = data.deliveredAt ?? null;
    this.cancelledAt = data.cancelledAt ?? null;
  }
}
