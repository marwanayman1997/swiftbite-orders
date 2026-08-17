import { coreClientGet, coreClientPost } from "./core-client.ts";
import { cacheProvider } from "../cache/init.ts";

export interface CoreBranch {
  id: number;
  region: string;
  restaurantId: number;
  restaurantOwnerId: number;
  restaurantStatus: string;
  acceptOrders: boolean;
  isActive: boolean;
  deliveryFee: number;
  commissionBps: number;
  currency: string;
  lat: number;
  lng: number;
  label: string;
  restaurantName: string;
  addressText: string;
}

export interface CoreBranchProduct {
  productId: number;
  name: string;
  imageUrl: string | null;
  price: number;
  stock: number;
  isAvailable: boolean;
}

const BRANCH_TTL_SECONDS = 60;
const PRODUCT_TTL_SECONDS = 30;

// Layer A read-through cache (system-design.md §3). TTL only — invalidated
// early by the branch.updated/branch.deactivated core-event handlers.
export async function getBranch(branchId: number): Promise<CoreBranch> {
  const cacheKey = `core:branch:${branchId}`;
  const cached = await cacheProvider.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const branch = await coreClientGet<CoreBranch>(
    `/api/internal/branches/${branchId}`,
  );
  await cacheProvider
    .set(cacheKey, JSON.stringify(branch), BRANCH_TTL_SECONDS)
    .catch(() => {});
  return branch;
}

// Cached per (branchId, productId) — invalidated by product.stock.changed /
// product.price.changed core-event handlers.
export async function getBranchProducts(
  branchId: number,
  productIds: number[],
): Promise<CoreBranchProduct[]> {
  if (productIds.length === 0) return [];

  const results: CoreBranchProduct[] = [];
  const missingIds: number[] = [];

  for (const productId of productIds) {
    const cached = await cacheProvider.get(
      `core:product:price:${branchId}:${productId}`,
    );
    if (cached) {
      results.push(JSON.parse(cached));
    } else {
      missingIds.push(productId);
    }
  }

  if (missingIds.length > 0) {
    const fetched = await coreClientGet<CoreBranchProduct[]>(
      `/api/product/internal/branches/${branchId}/products?ids=${missingIds.join(",")}`,
    );
    for (const product of fetched) {
      await cacheProvider
        .set(
          `core:product:price:${branchId}:${product.productId}`,
          JSON.stringify(product),
          PRODUCT_TTL_SECONDS,
        )
        .catch(() => {});
      results.push(product);
    }
  }

  return results;
}

// Mutating — not cached. Idempotent on core's side via Idempotency-Key.
export async function reserveStock(
  branchId: number,
  items: Array<{ productId: number; quantity: number }>,
  idempotencyKey: string,
): Promise<void> {
  await coreClientPost(
    `/api/product/internal/branches/${branchId}/reserve-stock`,
    { items },
    { idempotencyKey },
  );
}
