export const TOKENS = {
  Logger: Symbol.for("Logger"),
  CacheProvider: Symbol.for("CacheProvider"),
  WsServer: Symbol.for("WsServer"),

  OrderService: Symbol.for("OrderService"),
  OrderController: Symbol.for("OrderController"),

  PaymentService: Symbol.for("PaymentService"),
  PaymentController: Symbol.for("PaymentController"),
  KashierWebhookService: Symbol.for("KashierWebhookService"),
  WebhookController: Symbol.for("WebhookController"),

  AssignmentService: Symbol.for("AssignmentService"),
  DeliveryService: Symbol.for("DeliveryService"),
  DeliveryController: Symbol.for("DeliveryController"),

  PresenceService: Symbol.for("PresenceService"),
  PresenceController: Symbol.for("PresenceController"),
  AgentService: Symbol.for("AgentService"),
  EarningService: Symbol.for("EarningService"),
  AgentController: Symbol.for("AgentController"),

  FinanceService: Symbol.for("FinanceService"),
  FinanceController: Symbol.for("FinanceController"),
};
