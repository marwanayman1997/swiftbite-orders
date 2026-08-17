import { AppError } from "../../lib/error/AppError.ts";

export const OrderNotPendingPaymentError = new AppError(
  "OrderNotPendingPayment",
  409,
);
export const PaymentProviderUnavailableError = new AppError(
  "Payment provider unavailable",
  503,
);
export const InvalidSignatureError = new AppError("InvalidSignature", 401);
export const PaymentNotFoundError = new AppError("PaymentNotFound", 404);
export const PaymentAlreadyRefundedError = new AppError(
  "Payment is already fully refunded",
  409,
);
export const PaymentNotRefundableError = new AppError(
  "Payment is not in a refundable state",
  409,
);
