import { AppError } from "../../lib/error/AppError.ts";

export const OrderNotReadyError = new AppError("OrderNotReady", 409);
export const OrderAlreadyHasActiveDeliveryError = new AppError(
  "OrderAlreadyHasActiveDelivery",
  409,
);
export const NoEligibleAgentsError = new AppError("NoEligibleAgents", 409);
export const MaxReassignmentAttemptsReachedError = new AppError(
  "MaxReassignmentAttemptsReached",
  409,
);
export const DeliveryNotFoundError = new AppError("DeliveryNotFound", 404);
export const NoActiveDeliveryError = new AppError(
  "NoActiveDeliveryForOrder",
  409,
);

export function invalidDeliveryTransitionError(from: string, to: string) {
  return new AppError("InvalidStatusTransition", 409, true, { from, to });
}
