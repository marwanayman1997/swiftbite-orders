import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { TOKENS } from "../../../lib/di/tokens.ts";
import { sendPaginated, sendSuccess } from "../../../lib/http/response.ts";
import { parsePaginationQuery } from "../../../lib/http/pagination/parse-query.ts";
import { validateBody } from "../../../lib/validation/validate.ts";
import { AppError } from "../../../lib/error/AppError.ts";
import {
  RegionNotResolvedError,
  UnAuthorizedError,
} from "../../../lib/auth/errors.ts";
import { FinanceService } from "../service/finance.service.ts";
import { CreatePayoutRequestDTO } from "../dto/finance.request.dto.ts";
import {
  PayoutResponseDTO,
  RestaurantBalanceResponseDTO,
} from "../dto/finance.response.dto.ts";

const PAYOUT_SORT_FIELDS = ["created_at"];

@injectable()
export class FinanceController {
  constructor(
    @inject(TOKENS.FinanceService)
    private readonly financeService: FinanceService,
  ) {}

  // system_admin may act on any restaurant (via ?restaurantId= or body.restaurantId);
  // every other caller is always scoped to their own token restaurantId, never a
  // client-supplied one.
  private resolveRestaurantId(req: Request, bodyRestaurantId?: number): number {
    if (req.user!.role === "system_admin") {
      const restaurantId = bodyRestaurantId ?? Number(req.query.restaurantId);
      if (!restaurantId) throw new AppError("restaurantId is required", 400);
      return restaurantId;
    }
    if (!req.user!.restaurantId) throw UnAuthorizedError;
    return req.user!.restaurantId;
  }

  getBalance = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const restaurantId = this.resolveRestaurantId(req);
      const balances = await this.financeService.getBalance(
        req.region,
        restaurantId,
      );
      sendSuccess(
        res,
        RestaurantBalanceResponseDTO.from(restaurantId, balances),
      );
    } catch (err) {
      next(err);
    }
  };

  listPayouts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const restaurantId = this.resolveRestaurantId(req);

      const from = req.query.from
        ? new Date(String(req.query.from))
        : new Date(0);
      const to = req.query.to ? new Date(String(req.query.to)) : new Date();
      const pagination = parsePaginationQuery(req.query, {
        allowedSortFields: PAYOUT_SORT_FIELDS,
        defaultSortBy: "created_at",
      });

      const { data, meta } = await this.financeService.listPayouts(
        req.region,
        restaurantId,
        from,
        to,
        pagination,
      );
      sendPaginated(res, data.map(PayoutResponseDTO.from), meta);
    } catch (err) {
      next(err);
    }
  };

  recordPayout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const body = await validateBody(CreatePayoutRequestDTO, req.body);
      const restaurantId = this.resolveRestaurantId(req, body.restaurantId);
      // Route-level idempotency({ strict: true }) guarantees this header is present.
      const idempotencyKey = req.header("Idempotency-Key")!;

      const tx = await this.financeService.recordPayout(
        req.region,
        restaurantId,
        body.amount,
        body.currency,
        idempotencyKey,
      );
      sendSuccess(res, PayoutResponseDTO.from(tx), 201);
    } catch (err) {
      next(err);
    }
  };
}
