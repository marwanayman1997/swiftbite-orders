import { env } from "../config/env.ts";
import { AppError } from "../error/AppError.ts";
import { retryWithBackoff } from "../../pkg/utils/retry.ts";

export interface CoreClientRequestOptions {
  correlationId?: string;
}

function baseHeaders(
  options: CoreClientRequestOptions,
): Record<string, string> {
  return {
    "api-key": env.core.internalApiKey,
    ...(options.correlationId
      ? { "X-CorrelationId": options.correlationId }
      : {}),
  };
}

// Only 5xx/network errors are retried — a non-2xx response with a status
// under 500 (404, 409, ...) is a definitive answer and is returned as-is so
// the caller can inspect status/body without wasting 3 retries on it.
async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await retryWithBackoff(
      async () => {
        const res = await fetch(url, init);
        if (res.status >= 500) {
          throw new Error(`core-service ${res.status} on ${url}`);
        }
        return res;
      },
      { retries: 3, baseDelayMs: 100, maxDelayMs: 500 },
    );
  } catch {
    throw new AppError("Core service unavailable", 503);
  }
}

// core-service's sendSuccess always wraps payloads as { success, data }; unwrap
// it here so every wrapper works with the plain resource shape.
export async function coreClientGet<T>(
  path: string,
  options: CoreClientRequestOptions = {},
): Promise<T> {
  const url = `${env.core.baseUrl}${path}`;
  const res = await fetchWithRetry(url, {
    method: "GET",
    headers: baseHeaders(options),
  });

  if (!res.ok) {
    throw new AppError(
      `core-service request failed: ${res.status} on ${path}`,
      502,
    );
  }
  const body = (await res.json()) as { success?: boolean; data?: T };
  return (body.success !== undefined ? body.data : body) as T;
}

// Mutating calls (currently only reserve-stock).
export async function coreClientPost<T>(
  path: string,
  body: unknown,
  options: CoreClientRequestOptions & { idempotencyKey?: string } = {},
): Promise<T> {
  const url = `${env.core.baseUrl}${path}`;
  const res = await fetchWithRetry(url, {
    method: "POST",
    headers: {
      ...baseHeaders(options),
      "Content-Type": "application/json",
      ...(options.idempotencyKey
        ? { "Idempotency-Key": options.idempotencyKey }
        : {}),
    },
    body: JSON.stringify(body),
  });

  const responseBody = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new AppError(
      responseBody.error ?? `core-service request failed: ${res.status}`,
      res.status,
      true,
      responseBody.details,
    );
  }
  return (
    responseBody.success !== undefined ? responseBody.data : responseBody
  ) as T;
}
