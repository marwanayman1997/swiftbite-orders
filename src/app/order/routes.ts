import { Router } from "express";
import { authenticate } from "../../lib/auth/guard.ts";
import { rbac, requireBranchAccess } from "../../lib/auth/rbac.ts";
import { idempotency } from "../../lib/idempotency/idempotency.ts";
import { withCache } from "../../lib/cache/withCache.ts";
import { container } from "../../lib/di/container.ts";
import { TOKENS } from "../../lib/di/tokens.ts";
import { OrderController } from "./controller/order.controller.ts";

export const orderRouter = Router();
const orderController = container.resolve<OrderController>(
  TOKENS.OrderController,
);

orderRouter.post(
  "/orders",
  authenticate,
  idempotency({ strict: true, persistToDb: true }),
  orderController.create,
);

orderRouter.get("/orders/:publicId", authenticate, orderController.getById);

orderRouter.get("/customer/orders", authenticate, orderController.listCustomer);

orderRouter.get(
  "/restaurant/orders",
  authenticate,
  rbac({ resource: "orders", action: "read" }),
  requireBranchAccess("branchId"),
  withCache(10),
  orderController.listRestaurant,
);

// Authorization for the target status is resolved inside the service (the
// required permission depends on the requested target, not a fixed
// resource:action a route-level rbac() call could express).
orderRouter.patch(
  "/orders/:publicId/status",
  authenticate,
  idempotency({ strict: true }),
  orderController.updateStatus,
);
