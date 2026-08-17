import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import { TOKENS } from "../../../lib/di/tokens.ts";
import { sendPaginated, sendSuccess } from "../../../lib/http/response.ts";
import { parsePaginationQuery } from "../../../lib/http/pagination/parse-query.ts";
import { AgentService } from "../service/agent.service.ts";
import { EarningService } from "../service/earning.service.ts";
import {
  AgentEarningsResponseDTO,
  DeliveryTaskResponseDTO,
} from "../dto/agent.response.dto.ts";
import { DeliveryStatus } from "../../delivery/enums.ts";
import {
  RegionNotResolvedError,
  UnAuthorizedError,
} from "../../../lib/auth/errors.ts";

const TASK_SORT_FIELDS = ["assigned_at"];
const EARNING_SORT_FIELDS = ["earned_at"];
const REGION_CURRENCY: Record<string, string> = { eg: "EGP", ksa: "SAR" };

@injectable()
export class AgentController {
  constructor(
    @inject(TOKENS.AgentService) private readonly agentService: AgentService,
    @inject(TOKENS.EarningService)
    private readonly earningService: EarningService,
  ) {}

  tasks = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== "delivery_agent") throw UnAuthorizedError;
      if (!req.region || req.region === "all") throw RegionNotResolvedError;
      const status = req.query.status as DeliveryStatus | undefined;
      const pagination = parsePaginationQuery(req.query, {
        allowedSortFields: TASK_SORT_FIELDS,
        defaultSortBy: "assigned_at",
      });
      const { data, meta } = await this.agentService.listTasks(
        req.user!.userId,
        req.region,
        status,
        pagination,
      );
      sendPaginated(
        res,
        data.map(
          ({ delivery, order, itemsCount, branchName, branchAddressText }) =>
            DeliveryTaskResponseDTO.from(
              delivery,
              order,
              itemsCount,
              branchName,
              branchAddressText,
            ),
        ),
        meta,
      );
    } catch (err) {
      next(err);
    }
  };

  earnings = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.user!.role !== "delivery_agent") throw UnAuthorizedError;
      if (!req.region || req.region === "all") throw RegionNotResolvedError;

      const now = new Date();
      const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      const from = req.query.from
        ? new Date(String(req.query.from))
        : defaultFrom;
      const to = req.query.to ? new Date(String(req.query.to)) : now;

      const pagination = parsePaginationQuery(req.query, {
        allowedSortFields: EARNING_SORT_FIELDS,
        defaultSortBy: "earned_at",
      });

      const { data, meta, orderPublicIds, totals } =
        await this.earningService.list(
          req.user!.userId,
          req.region,
          from,
          to,
          pagination,
        );

      const currency =
        data[0]?.currency ?? REGION_CURRENCY[req.region] ?? "EGP";
      const dto = AgentEarningsResponseDTO.from(
        from.toISOString(),
        to.toISOString(),
        currency,
        totals,
        data,
        orderPublicIds,
        meta.nextCursor,
      );
      sendSuccess(res, dto);
    } catch (err) {
      next(err);
    }
  };
}
