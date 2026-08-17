import { OrderItemEntity } from "../entity/order-item.entity.ts";

export class OrderItemResponseDTO {
  productId!: number;
  name!: string;
  imageUrl?: string;
  quantity!: number;
  unitPrice!: number;
  lineTotal!: number;

  static from(item: OrderItemEntity): OrderItemResponseDTO {
    const dto = new OrderItemResponseDTO();
    dto.productId = item.productId;
    dto.name = item.nameSnapshot;
    dto.imageUrl = item.imageUrlSnapshot ?? undefined;
    dto.quantity = item.quantity;
    dto.unitPrice = item.unitPriceSnapshot;
    dto.lineTotal = item.lineTotal;
    return dto;
  }
}
