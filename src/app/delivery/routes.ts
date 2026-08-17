import { Router } from "express";
import { authenticate } from "../../lib/auth/guard.ts";
import { rbac } from "../../lib/auth/rbac.ts";
import { container } from "../../lib/di/container.ts";
import { TOKENS } from "../../lib/di/tokens.ts";
import { DeliveryController } from "./controller/delivery.controller.ts";

export const deliveryRouter = Router();
const deliveryController = container.resolve<DeliveryController>(
  TOKENS.DeliveryController,
);

deliveryRouter.post(
  "/deliveries/assign/:orderId",
  authenticate,
  rbac({ resource: "deliveries", action: "assign" }),
  deliveryController.assign,
);

deliveryRouter.post(
  "/deliveries/reassign/:orderId",
  authenticate,
  rbac({ resource: "deliveries", action: "assign" }),
  deliveryController.reassign,
);

deliveryRouter.patch(
  "/deliveries/:deliveryId/status",
  authenticate,
  deliveryController.updateStatus,
);
