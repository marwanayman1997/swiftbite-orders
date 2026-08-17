import crypto from "crypto";

// Kashier's webhook signing scheme (developers.kashier.io/webhooks/setup):
// sort the `signatureKeys` the payload itself names, build a
// `key=value&key=value...` query string from just those fields (in that
// sorted order), then HMAC-SHA256 it with the Payment API key. The result
// must match the `x-kashier-signature` header exactly.
export function verifyKashierSignature(
  payload: Record<string, unknown>,
  signatureKeys: string[],
  receivedSignature: string,
  secret: string,
): boolean {
  if (!receivedSignature || signatureKeys.length === 0) return false;

  const sortedKeys = [...signatureKeys].sort();
  // Values must be URL-encoded before joining — confirmed empirically against
  // a real Kashier webhook payload; an unencoded space/pipe in e.g. `channel`
  // ("online | e-commerce") produces a signature mismatch otherwise.
  const queryString = sortedKeys
    .map((key) => `${key}=${encodeURIComponent(String(payload[key]))}`)
    .join("&");
  const computed = crypto
    .createHmac("sha256", secret)
    .update(queryString)
    .digest("hex");

  const computedBuf = Buffer.from(computed, "hex");
  const receivedBuf = Buffer.from(receivedSignature, "hex");
  if (computedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(computedBuf, receivedBuf);
}
