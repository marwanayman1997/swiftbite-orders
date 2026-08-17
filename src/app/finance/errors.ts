import { AppError } from "../../lib/error/AppError.ts";

export const InsufficientBalanceError = new AppError(
  "InsufficientBalance",
  409,
);
