import { cacheProvider } from "../../cache/init.ts";

export interface ProductPriceChangedPayload {
  branchId: number;
  productId: number;
  price: number;
}

export async function handleProductPriceChanged(
  payload: ProductPriceChangedPayload,
): Promise<void> {
  await cacheProvider.del(
    `core:product:price:${payload.branchId}:${payload.productId}`,
  );
}
