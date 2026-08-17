import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { ICacheProvider } from "../../pkg/cache/cache.interface.ts";
import { container } from "../di/container.ts";
import { TOKENS } from "../di/tokens.ts";
import { AppError } from "../error/AppError.ts";
import { db } from "../knex/knex.ts";
import { tryGet, store } from "./idempotency-store.ts";

export interface IdempotencyOptions {
  strict?: boolean;
  ttlSeconds?: number;
  // Also persist to the idempotency_keys table (durable fallback if Redis is
  // lost) — only used on the critical write paths (POST /orders,
  // POST /payments/init) per CLAUDE.md §8. Requires req.region to already be
  // resolved; if it isn't (e.g. POST /orders without X-Region, resolved from
  // branchId later in the service), the DB fallback is silently skipped and
  // Redis remains the sole backing store for that request.
  persistToDb?: boolean;
}

interface CachedEntry {
  fingerprint: string;
  status: number;
  body: unknown;
}

const IDEMPOTENT_METHODS = new Set(["POST", "PATCH", "PUT"]);
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

function fingerprint(body: unknown): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(body ?? {}))
    .digest("hex");
}

// Keys are scoped by user_id so one user can never replay another user's
// cached response for the same Idempotency-Key value (see system-design.md §12).
// Same key + same body -> replays the cached response. Same key + different
// body -> 409 IdempotencyConflict (business-logic/orders.md §2).
export function idempotency(options: IdempotencyOptions = {}) {
  const {
    strict = false,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    persistToDb = false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (!IDEMPOTENT_METHODS.has(req.method)) {
      return next();
    }

    const idempotencyKey = req.header("Idempotency-Key");
    if (!idempotencyKey) {
      if (strict) {
        return next(new AppError("Idempotency-Key header is required", 400));
      }
      return next();
    }

    const userId = req.user?.userId ?? "anon";
    const key = `idempotency:${req.method}:${req.originalUrl}:${userId}:${idempotencyKey}`;
    const requestFingerprint = fingerprint(req.body);
    const cacheProvider: ICacheProvider = container.resolve(
      TOKENS.CacheProvider,
    );
    const canUseDbFallback =
      persistToDb && !!req.region && req.region !== "all" && !!req.user?.userId;

    let cached: string | null = null;
    let redisDown = false;
    try {
      cached = await cacheProvider.get(key);
    } catch (err) {
      redisDown = true;
    }

    if (cached) {
      const entry: CachedEntry = JSON.parse(cached);
      if (entry.fingerprint !== requestFingerprint) {
        return next(new AppError("IdempotencyConflict", 409));
      }
      return res.status(200).json(entry.body);
    }

    if (redisDown) {
      if (!canUseDbFallback) {
        if (strict) {
          return next(new AppError("Idempotency check unavailable", 503));
        }
        return next();
      }

      try {
        const result = await tryGet(
          db(req.region!),
          req.method,
          req.originalUrl,
          idempotencyKey,
          req.body,
        );
        if (result === "conflict") {
          return next(new AppError("IdempotencyConflict", 409));
        }
        if (result) {
          return res.status(200).json(result.responseBody);
        }
        // no prior record — fall through and let the request proceed;
        // the response is persisted to the DB below once it completes.
      } catch (dbErr) {
        if (strict) {
          return next(new AppError("Idempotency check unavailable", 503));
        }
        return next();
      }
    }

    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entry: CachedEntry = {
          fingerprint: requestFingerprint,
          status: res.statusCode,
          body,
        };
        cacheProvider
          .set(key, JSON.stringify(entry), ttlSeconds)
          .catch(() => {});

        if (canUseDbFallback) {
          store(db(req.region!), {
            region: req.region!,
            userId: req.user!.userId,
            method: req.method,
            path: req.originalUrl,
            key: idempotencyKey,
            requestBody: req.body,
            responseStatus: res.statusCode,
            responseBody: body,
            ttlSeconds,
          }).catch(() => {});
        }
      }
      return originalJson(body);
    };

    next();
  };
}
