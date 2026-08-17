import { injectable } from "tsyringe";
import { db } from "../../../lib/knex/knex.ts";
import {
  findAgentEarnings,
  sumAgentEarnings,
} from "../repository/agent-earning.repo.ts";
import type { PaginationParams } from "../../../lib/http/pagination/cursor-pagination.ts";

@injectable()
export class EarningService {
  list = async (
    agentId: number,
    region: string,
    from: Date,
    to: Date,
    pagination: PaginationParams,
  ) => {
    const conn = db(region);
    const [page, totals] = await Promise.all([
      findAgentEarnings(conn, agentId, from, to, pagination),
      sumAgentEarnings(conn, agentId, from, to),
    ]);
    return { ...page, totals };
  };
}
