import { registerCoreEventHandler } from "./consumer.ts";
import { handleProductStockChanged } from "./handlers/product-stock-changed.handler.ts";
import { handleProductPriceChanged } from "./handlers/product-price-changed.handler.ts";
import { handleBranchUpdated } from "./handlers/branch-updated.handler.ts";
import { handleBranchDeactivated } from "./handlers/branch-deactivated.handler.ts";
import { handleRestaurantSuspended } from "./handlers/restaurant-suspended.handler.ts";

export function registerCoreEventHandlers(): void {
  registerCoreEventHandler(
    "product.stock.changed",
    handleProductStockChanged as any,
  );
  registerCoreEventHandler(
    "product.price.changed",
    handleProductPriceChanged as any,
  );
  registerCoreEventHandler("branch.updated", handleBranchUpdated as any);
  registerCoreEventHandler(
    "branch.deactivated",
    handleBranchDeactivated as any,
  );
  registerCoreEventHandler(
    "restaurant.suspended",
    handleRestaurantSuspended as any,
  );
}
