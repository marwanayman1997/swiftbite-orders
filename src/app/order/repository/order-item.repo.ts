import { Knex } from "knex";
import { OrderItemEntity } from "../entity/order-item.entity.ts";

const ORDER_ITEM_COLUMNS = [
  "id",
  "region",
  "order_id",
  "product_id",
  "quantity",
  "unit_price_snapshot",
  "name_snapshot",
  "image_url_snapshot",
  "line_total",
  "created_at",
];

function toEntity(row: any): OrderItemEntity {
  return new OrderItemEntity({
    id: Number(row.id),
    region: row.region,
    orderId: Number(row.order_id),
    productId: Number(row.product_id),
    quantity: Number(row.quantity),
    unitPriceSnapshot: Number(row.unit_price_snapshot),
    nameSnapshot: row.name_snapshot,
    imageUrlSnapshot: row.image_url_snapshot,
    lineTotal: Number(row.line_total),
    createdAt: row.created_at,
  });
}

export interface BulkInsertItemInput {
  productId: number;
  quantity: number;
  unitPriceSnapshot: number;
  nameSnapshot: string;
  imageUrlSnapshot: string | null;
  lineTotal: number;
}

export async function bulkInsertItems(
  conn: Knex,
  region: string,
  orderId: number,
  items: BulkInsertItemInput[],
): Promise<OrderItemEntity[]> {
  const rows = await conn("order_items")
    .insert(
      items.map((item) => ({
        region,
        order_id: orderId,
        product_id: item.productId,
        quantity: item.quantity,
        unit_price_snapshot: item.unitPriceSnapshot,
        name_snapshot: item.nameSnapshot,
        image_url_snapshot: item.imageUrlSnapshot,
        line_total: item.lineTotal,
      })),
    )
    .returning(ORDER_ITEM_COLUMNS);
  return rows.map(toEntity);
}

// Batch fetch — never call per-order in a loop (N+1 guard).
export async function findItemsByOrderIds(
  conn: Knex,
  orderIds: number[],
): Promise<OrderItemEntity[]> {
  if (orderIds.length === 0) return [];
  const rows = await conn("order_items")
    .select(ORDER_ITEM_COLUMNS)
    .whereIn("order_id", orderIds);
  return rows.map(toEntity);
}
