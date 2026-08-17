import { AppError } from "../error/AppError.ts";

export const NotAuthenticated = new AppError("User not authenticated", 401);
export const UnAuthorizedError = new AppError("User not authorized", 403);
export const RegionNotResolvedError = new AppError(
  "X-Region header is required",
  400,
);
