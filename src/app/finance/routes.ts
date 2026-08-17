import { Router } from "express";
import { authenticate } from "../../lib/auth/guard.ts";
import { rbac } from "../../lib/auth/rbac.ts";
import { idempotency } from "../../lib/idempotency/idempotency.ts";
import { container } from "../../lib/di/container.ts";
import { TOKENS } from "../../lib/di/tokens.ts";
import { FinanceController } from "./controller/finance.controller.ts";

export const financeRouter = Router();
const financeController = container.resolve<FinanceController>(
  TOKENS.FinanceController,
);

financeRouter.get(
  "/restaurant/balance",
  authenticate,
  rbac({ resource: "finance", action: "read" }),
  financeController.getBalance,
);

financeRouter.get(
  "/restaurant/payouts",
  authenticate,
  rbac({ resource: "finance", action: "read" }),
  financeController.listPayouts,
);

financeRouter.post(
  "/restaurant/payouts",
  authenticate,
  rbac({ resource: "finance", action: "payout_create" }),
  idempotency({ strict: true, persistToDb: true }),
  financeController.recordPayout,
);
