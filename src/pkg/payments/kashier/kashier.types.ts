export interface KashierCreateSessionResponse {
  _id: string;
  sessionUrl: string;
  status: string;
}

export interface KashierRefundResponse {
  status: string;
  response?: {
    transactionId?: string;
    amount?: string;
    currency?: string;
    gatewayCode?: string;
  };
}

export interface KashierWebhookPayload {
  event: string; // "pay", "refund", ...
  status: string; // "SUCCESS", "FAILED", ...
  amount: string;
  currency: string;
  merchantOrderId: string;
  kashierOrderId: string;
  signatureKeys: string[];
  [key: string]: unknown;
}
