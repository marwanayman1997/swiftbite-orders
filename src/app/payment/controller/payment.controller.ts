import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { TOKENS } from "../../../lib/di/tokens.ts";
import { validateBody } from "../../../lib/validation/validate.ts";
import { sendSuccess } from "../../../lib/http/response.ts";
import {
  InitPaymentRequestDTO,
  RefundRequestDTO,
} from "../dto/payment.request.dto.ts";
import {
  PaymentInitResponseDTO,
  PaymentResponseDTO,
  RefundInitiatedResponseDTO,
} from "../dto/payment.response.dto.ts";
import { PaymentService } from "../service/payment.service.ts";
import {
  RegionNotResolvedError,
  UnAuthorizedError,
} from "../../../lib/auth/errors.ts";

@injectable()
export class PaymentController {
  constructor(
    @inject(TOKENS.PaymentService)
    private readonly paymentService: PaymentService,
  ) {}

  init = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== "customer") throw UnAuthorizedError;
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const data = await validateBody(InitPaymentRequestDTO, req.body);
      const session = await this.paymentService.init(
        data.orderId,
        req.region,
        req.user!.userId,
        req.user!.email,
      );
      sendSuccess(
        res,
        PaymentInitResponseDTO.from(
          session,
          this.paymentService.getExpiresAt(),
        ),
      );
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const paymentId = Number(req.params.paymentId);
      const { transaction, orderPublicId } = await this.paymentService.getById(
        paymentId,
        req.region,
        req.user!,
      );
      sendSuccess(res, PaymentResponseDTO.from(transaction, orderPublicId));
    } catch (err) {
      next(err);
    }
  };

  refund = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== "system_admin") throw UnAuthorizedError;
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const paymentId = Number(req.params.paymentId);
      const data = await validateBody(RefundRequestDTO, req.body);
      const refundTransaction = await this.paymentService.refund(
        paymentId,
        req.region,
        data,
      );
      sendSuccess(res, RefundInitiatedResponseDTO.from(refundTransaction), 202);
    } catch (err) {
      next(err);
    }
  };
}
