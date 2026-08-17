import { Router } from "express";
import { authenticate } from "../../lib/auth/guard.ts";
import { idempotency } from "../../lib/idempotency/idempotency.ts";
import { container } from "../../lib/di/container.ts";
import { TOKENS } from "../../lib/di/tokens.ts";
import { PaymentController } from "./controller/payment.controller.ts";
import { WebhookController } from "./controller/webhook.controller.ts";

export const paymentRouter = Router();
const paymentController = container.resolve<PaymentController>(
  TOKENS.PaymentController,
);
const webhookController = container.resolve<WebhookController>(
  TOKENS.WebhookController,
);

paymentRouter.post(
  "/payments/init",
  authenticate,
  idempotency({ strict: true }),
  paymentController.init,
);

// No auth — verified by Kashier's HMAC signature instead.
paymentRouter.post("/payments/webhook/:provider", webhookController.handle);

paymentRouter.get(
  "/payments/:paymentId",
  authenticate,
  paymentController.getById,
);

paymentRouter.post(
  "/payments/:paymentId/refund",
  authenticate,
  idempotency({ strict: true }),
  paymentController.refund,
);
