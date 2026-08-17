import { Router } from "express";
import { healthRouter } from "./app/health/health.routes.ts";
import { orderRouter } from "./app/order/routes.ts";
import { paymentRouter } from "./app/payment/routes.ts";
import { deliveryRouter } from "./app/delivery/routes.ts";
import { agentRouter } from "./app/agent/routes.ts";
import { financeRouter } from "./app/finance/routes.ts";

export const routes: Router = Router();

routes.use("/health", healthRouter);
routes.use("/", orderRouter);
routes.use("/", paymentRouter);
routes.use("/", deliveryRouter);
routes.use("/", agentRouter);
routes.use("/", financeRouter);
