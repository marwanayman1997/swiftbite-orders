import { fromMinor } from "../../utils/money.ts";
import { verifyKashierSignature } from "./kashier.signature.ts";
import type {
  CreateSessionInput,
  CreateSessionResult,
  IPaymentProvider,
  RefundResult,
} from "../payment.interface.ts";
import type {
  KashierCreateSessionResponse,
  KashierRefundResponse,
} from "./kashier.types.ts";

export interface KashierClientConfig {
  baseUrl: string;
  merchantId: string;
  apiKey: string;
  secretKey: string;
  webhookSecret: string;
  merchantRedirect: string;
  serverWebhook: string;
}

// Raw HTTP client for Kashier v3, implementing the generic IPaymentProvider
// (developers.kashier.io/payment/payment-sessions, .../payment/refund,
// .../webhooks/setup). No app types, no env access — config is injected by
// the caller (see lib/payments/init.ts).
export class KashierClient implements IPaymentProvider {
  constructor(private readonly config: KashierClientConfig) {}

  private headers(): Record<string, string> {
    return {
      Authorization: this.config.secretKey,
      "api-key": this.config.apiKey,
      "Content-Type": "application/json",
    };
  }

  async createSession(input: CreateSessionInput): Promise<CreateSessionResult> {
    const res = await fetch(`${this.config.baseUrl}/v3/payment/sessions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        merchantId: this.config.merchantId,
        order: input.orderId,
        amount: fromMinor(input.amountMinor).toFixed(2),
        currency: input.currency,
        merchantRedirect: this.config.merchantRedirect,
        serverWebhook: this.config.serverWebhook,
        // Required by Kashier's v3 Payment Sessions API (undocumented in our
        // original scaffold — discovered live: a request without it 400s
        // with "customer is required").
        customer: input.customer,
      }),
    });

    const body = (await res
      .json()
      .catch(() => ({}))) as KashierCreateSessionResponse;
    if (!res.ok) {
      throw new Error(
        `Kashier createSession failed: ${res.status} ${JSON.stringify(body)}`,
      );
    }
    return {
      providerSessionId: body._id,
      redirectUrl: body.sessionUrl,
      raw: body,
    };
  }

  async refund(
    providerReferenceId: string,
    amountMinor: number,
    reason: string,
  ): Promise<RefundResult> {
    const res = await fetch(
      `${this.config.baseUrl}/orders/${providerReferenceId}/`,
      {
        method: "PUT",
        headers: { ...this.headers(), Accept: "application/json" },
        body: JSON.stringify({
          apiOperation: "REFUND",
          reason,
          transaction: { amount: fromMinor(amountMinor).toFixed(2) },
        }),
      },
    );

    const body = (await res.json().catch(() => ({}))) as KashierRefundResponse;
    if (!res.ok) {
      throw new Error(
        `Kashier refund failed: ${res.status} ${JSON.stringify(body)}`,
      );
    }
    return {
      providerReferenceId: body.response?.transactionId ?? providerReferenceId,
      status: body.status,
      raw: body,
    };
  }

  verifyWebhook(payload: Record<string, unknown>, signature: string): boolean {
    // Confirmed empirically against a real Kashier webhook payload — the
    // real envelope is `{ platform, event, data: { ...fields, signatureKeys } }`,
    // not flat as originally assumed. signatureKeys/the signed fields live
    // under `data`, and the HMAC secret is the Payment API key, not a
    // separately configured "webhook secret" (matches this file's original
    // verifyKashierSignature doc comment — the call site just never used it).
    const data = (payload.data as Record<string, unknown>) ?? {};
    const signatureKeys = Array.isArray(data.signatureKeys)
      ? (data.signatureKeys as string[])
      : [];
    return verifyKashierSignature(
      data,
      signatureKeys,
      signature,
      this.config.apiKey,
    );
  }
}
