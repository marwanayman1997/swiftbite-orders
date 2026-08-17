import { cacheProvider } from "../../cache/init.ts";

export interface ProductStockChangedPayload {
  branchId: number;
  productId: number;
  stock: number;
}

export async function handleProductStockChanged(
  payload: ProductStockChangedPayload,
): Promise<void> {
  await cacheProvider.del(
    `core:product:price:${payload.branchId}:${payload.productId}`,
  );
}
