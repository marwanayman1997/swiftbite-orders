import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { TOKENS } from "../../../lib/di/tokens.ts";
import { validateBody } from "../../../lib/validation/validate.ts";
import { sendSuccess } from "../../../lib/http/response.ts";
import { PresenceOnlineRequestDTO } from "../dto/presence.request.dto.ts";
import { PresenceService } from "../service/presence.service.ts";
import {
  RegionNotResolvedError,
  UnAuthorizedError,
} from "../../../lib/auth/errors.ts";

@injectable()
export class PresenceController {
  constructor(
    @inject(TOKENS.PresenceService)
    private readonly presenceService: PresenceService,
  ) {}

  online = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== "delivery_agent") throw UnAuthorizedError;
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const data = await validateBody(PresenceOnlineRequestDTO, req.body);
      await this.presenceService.online(
        req.user!.userId,
        req.region,
        data.lat,
        data.lng,
      );
      sendSuccess(res, { ok: true });
    } catch (err) {
      next(err);
    }
  };

  offline = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== "delivery_agent") throw UnAuthorizedError;
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      await this.presenceService.offline(req.user!.userId, req.region);
      sendSuccess(res, { ok: true });
    } catch (err) {
      next(err);
    }
  };

  ping = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== "delivery_agent") throw UnAuthorizedError;
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const data = await validateBody(PresenceOnlineRequestDTO, req.body);
      await this.presenceService.ping(
        req.user!.userId,
        req.region,
        data.lat,
        data.lng,
      );
      sendSuccess(res, { ok: true });
    } catch (err) {
      next(err);
    }
  };
}
