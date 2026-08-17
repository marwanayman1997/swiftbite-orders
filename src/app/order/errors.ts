import { AppError } from "../../lib/error/AppError.ts";
import { OrderStatus } from "./enums.ts";

export const OrderNotFoundError = new AppError("OrderNotFound", 404);
export const BranchNotAcceptingOrdersError = new AppError(
  "BranchNotAcceptingOrders",
  409,
);
export const CancellationWindowExpiredError = new AppError(
  "CancellationWindowExpired",
  409,
);
export const OrderRegionMismatchError = new AppError(
  "Order does not belong to the resolved region",
  400,
);
export const AddressNotOwnedError = new AppError("User not authorised", 403);

export function outOfStockError(
  details: Array<{ productId: number; requested: number; available: number }>,
): AppError {
  return new AppError("OutOfStock", 409, true, details);
}

export function invalidStatusTransitionError(
  from: OrderStatus,
  to: OrderStatus,
): AppError {
  return new AppError("InvalidStatusTransition", 409, true, { from, to });
}
