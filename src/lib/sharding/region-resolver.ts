import { NextFunction, Request, Response } from "express";
import { AppError } from "../error/AppError.ts";
import { RegionNotResolvedError } from "../auth/errors.ts";
import { isRegion } from "./regions.ts";

// Region comes from the X-Region header only — no path/query/cookie/JWT
// fallback (see system-design.md §2, implementation-plan.md Phase 0 item 18).
// "all" is reserved for admin fan-out reads; writes must resolve a concrete region.
export function resolveRegion(req: Request, res: Response, next: NextFunction) {
  const header = req.header("X-Region");

  if (!header) {
    return next();
  }

  if (header !== "all" && !isRegion(header)) {
    return next(new AppError(`Unknown region: ${header}`, 400));
  }

  req.region = header;
  next();
}

export interface RequireRegionOptions {
  allowAll?: boolean;
}

export function requireRegion(options: RequireRegionOptions = {}) {
  const { allowAll = false } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.region) {
      return next(RegionNotResolvedError);
    }
    if (req.region === "all" && !allowAll) {
      return next(RegionNotResolvedError);
    }
    next();
  };
}
