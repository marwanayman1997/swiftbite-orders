import { cacheProvider } from "../../cache/init.ts";

export interface RestaurantSuspendedPayload {
  restaurantId: number;
}

export async function handleRestaurantSuspended(
  payload: RestaurantSuspendedPayload,
): Promise<void> {
  await cacheProvider.del(`core:restaurant:${payload.restaurantId}`);
  // Flagging pending orders for admin review is a future admin-tooling
  // concern — no such queue exists yet, so this is cache invalidation only.
}
