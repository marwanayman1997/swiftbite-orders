import { KashierClient } from "../../pkg/payments/kashier/kashier.client.ts";
import type { IPaymentProvider } from "../../pkg/payments/payment.interface.ts";
import { env } from "../config/env.ts";

export const paymentProvider: IPaymentProvider = new KashierClient({
  baseUrl: env.kashier.baseUrl,
  merchantId: env.kashier.merchantId,
  apiKey: env.kashier.apiKey,
  secretKey: env.kashier.secretKey,
  webhookSecret: env.kashier.webhookSecret,
  merchantRedirect: env.kashier.returnUrl,
  serverWebhook: `${env.publicBaseUrl}/api/payments/webhook/kashier`,
});
