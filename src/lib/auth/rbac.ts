import { Request, Response, NextFunction } from "express";
import { NotAuthenticated } from "./errors.ts";
import { getPermissions, hasPermission } from "./permission-cache.ts";

export interface RBACOptions {
  resource: string;
  action: string;
  allowSystemAdmin?: boolean;
}

export function rbac(options: RBACOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw NotAuthenticated;
      }
      const { resource, action, allowSystemAdmin = true } = options;

      if (allowSystemAdmin && req.user.role === "system_admin") {
        return next();
      }

      if (req.user.role === "restaurant_user") {
        const permissions = await getPermissions(req.user.restaurantRole!);
        if (!hasPermission(permissions, resource, action)) {
          return res.status(403).json({ error: "Permission denied" });
        }
        return next();
      }

      return res.status(403).json({ error: "Permission denied" });
    } catch (error) {
      next(error);
    }
  };
}

export function requireRestaurantMember(paramName: string = "restaurantId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const restaurantId = parseInt(req.params[paramName] as string);
    if (!restaurantId) {
      return res.status(500).json({ message: "something went wrong" });
    }

    if (req.user?.role === "system_admin") return next();
    if (Number(req.user?.restaurantId) !== Number(restaurantId)) {
      return res.status(403).json({ error: "Permission denied" });
    }
    next();
  };
}

export function requireBranchAccess(paramName: string = "branchId") {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role === "system_admin") {
      return next();
    }
    if (req.user?.restaurantRole === "owner") {
      return next();
    }

    const branchId =
      parseInt(req.params[paramName] as string) ||
      parseInt(req.query[paramName] as string);
    if (!branchId) {
      return next();
    }

    const userBranchIds = req.user?.branchIds || [];
    if (!userBranchIds.includes(branchId)) {
      return res.status(403).json({
        error: "You do not have access to this branch",
      });
    }
    next();
  };
}
