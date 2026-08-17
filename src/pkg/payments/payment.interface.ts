export interface CreateSessionInput {
  orderId: string; // our order's publicId, used as the provider's merchant order reference
  amountMinor: number; // integer minor units (piasters/halalas)
  currency: string;
  customer: {
    reference: string; // our customerId, as a string
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface CreateSessionResult {
  providerSessionId: string;
  redirectUrl: string;
  raw: unknown;
}

export interface RefundResult {
  providerReferenceId: string;
  status: string;
  raw: unknown;
}

export interface IPaymentProvider {
  createSession(input: CreateSessionInput): Promise<CreateSessionResult>;
  refund(
    providerReferenceId: string,
    amountMinor: number,
    reason: string,
  ): Promise<RefundResult>;
  verifyWebhook(payload: Record<string, unknown>, signature: string): boolean;
}
