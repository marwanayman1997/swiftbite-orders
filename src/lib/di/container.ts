import { container } from "tsyringe";
import { cacheProvider } from "../cache/init.ts";
import { TOKENS } from "./tokens.ts";
import { Logger } from "../logger/logger.ts";
import { OrderController } from "../../app/order/controller/order.controller.ts";
import { OrderService } from "../../app/order/service/order.service.ts";
import { PaymentController } from "../../app/payment/controller/payment.controller.ts";
import { WebhookController } from "../../app/payment/controller/webhook.controller.ts";
import { PaymentService } from "../../app/payment/service/payment.service.ts";
import { KashierWebhookService } from "../../app/payment/service/kashier-webhook.service.ts";
import { AssignmentService } from "../../app/delivery/service/assignment.service.ts";
import { DeliveryService } from "../../app/delivery/service/delivery.service.ts";
import { DeliveryController } from "../../app/delivery/controller/delivery.controller.ts";
import { PresenceService } from "../../app/agent/service/presence.service.ts";
import { PresenceController } from "../../app/agent/controller/presence.controller.ts";
import { AgentService } from "../../app/agent/service/agent.service.ts";
import { EarningService } from "../../app/agent/service/earning.service.ts";
import { AgentController } from "../../app/agent/controller/agent.controller.ts";
import { FinanceService } from "../../app/finance/service/finance.service.ts";
import { FinanceController } from "../../app/finance/controller/finance.controller.ts";

// TOKENS.WsServer is registered at runtime in server.ts once the socket.io
// server is attached to the shared http.Server.
container.registerSingleton<Logger>(TOKENS.Logger, Logger);
container.registerInstance(TOKENS.CacheProvider, cacheProvider);

container.registerSingleton<OrderService>(TOKENS.OrderService, OrderService);
container.registerSingleton<OrderController>(
  TOKENS.OrderController,
  OrderController,
);

container.registerSingleton<PaymentService>(
  TOKENS.PaymentService,
  PaymentService,
);
container.registerSingleton<PaymentController>(
  TOKENS.PaymentController,
  PaymentController,
);
container.registerSingleton<KashierWebhookService>(
  TOKENS.KashierWebhookService,
  KashierWebhookService,
);
container.registerSingleton<WebhookController>(
  TOKENS.WebhookController,
  WebhookController,
);

container.registerSingleton<AssignmentService>(
  TOKENS.AssignmentService,
  AssignmentService,
);
container.registerSingleton<DeliveryService>(
  TOKENS.DeliveryService,
  DeliveryService,
);
container.registerSingleton<DeliveryController>(
  TOKENS.DeliveryController,
  DeliveryController,
);

container.registerSingleton<PresenceService>(
  TOKENS.PresenceService,
  PresenceService,
);
container.registerSingleton<PresenceController>(
  TOKENS.PresenceController,
  PresenceController,
);
container.registerSingleton<AgentService>(TOKENS.AgentService, AgentService);
container.registerSingleton<EarningService>(
  TOKENS.EarningService,
  EarningService,
);
container.registerSingleton<AgentController>(
  TOKENS.AgentController,
  AgentController,
);

container.registerSingleton<FinanceService>(
  TOKENS.FinanceService,
  FinanceService,
);
container.registerSingleton<FinanceController>(
  TOKENS.FinanceController,
  FinanceController,
);

export { container };
