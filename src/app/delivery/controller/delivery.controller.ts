import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { TOKENS } from "../../../lib/di/tokens.ts";
import { validateBody } from "../../../lib/validation/validate.ts";
import { sendSuccess } from "../../../lib/http/response.ts";
import {
  AssignDeliveryRequestDTO,
  UpdateDeliveryStatusRequestDTO,
} from "../dto/delivery.request.dto.ts";
import {
  DeliveryResponseDTO,
  DeliveryStatusResponseDTO,
} from "../dto/delivery.response.dto.ts";
import { DeliveryService } from "../service/delivery.service.ts";
import {
  RegionNotResolvedError,
  UnAuthorizedError,
} from "../../../lib/auth/errors.ts";

@injectable()
export class DeliveryController {
  constructor(
    @inject(TOKENS.DeliveryService)
    private readonly deliveryService: DeliveryService,
  ) {}

  assign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const data = await validateBody(AssignDeliveryRequestDTO, req.body);
      const { delivery, agent, orderPublicId } =
        await this.deliveryService.assign(
          String(req.params.orderId),
          req.region,
          data.agentId,
        );
      sendSuccess(
        res,
        DeliveryResponseDTO.from(delivery, orderPublicId, agent),
        201,
      );
    } catch (err) {
      next(err);
    }
  };

  reassign = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const { delivery, agent, orderPublicId } =
        await this.deliveryService.reassign(
          String(req.params.orderId),
          req.region,
        );
      sendSuccess(
        res,
        DeliveryResponseDTO.from(delivery, orderPublicId, agent),
        201,
      );
    } catch (err) {
      next(err);
    }
  };

  updateStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== "delivery_agent") throw UnAuthorizedError;
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const data = await validateBody(UpdateDeliveryStatusRequestDTO, req.body);
      const delivery = await this.deliveryService.updateStatus(
        Number(req.params.deliveryId),
        req.region,
        req.user!.userId,
        data.status,
      );
      sendSuccess(res, DeliveryStatusResponseDTO.from(delivery));
    } catch (err) {
      next(err);
    }
  };
}
