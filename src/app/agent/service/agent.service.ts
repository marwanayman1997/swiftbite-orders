import { inject, injectable } from "tsyringe";
import { db } from "../../../lib/knex/knex.ts";
import { TOKENS } from "../../../lib/di/tokens.ts";
import { OrderService } from "../../order/service/order.service.ts";
import { getBranch } from "../../../lib/core-client/branch.client.ts";
import { DeliveryStatus } from "../../delivery/enums.ts";
import { findDeliveriesByAgentId } from "../../delivery/repository/delivery.repo.ts";
import type { DeliveryEntity } from "../../delivery/entity/delivery.entity.ts";
// Read-only cross-module repo access — no atomicity concern (unlike the
// money-critical writes elsewhere), just a batch item-count lookup.
import { findItemsByOrderIds } from "../../order/repository/order-item.repo.ts";
import type { OrderEntity } from "../../order/entity/order.entity.ts";
import type {
  PaginationMeta,
  PaginationParams,
} from "../../../lib/http/pagination/cursor-pagination.ts";

@injectable()
export class AgentService {
  constructor(
    @inject(TOKENS.OrderService) private readonly orderService: OrderService,
  ) {}

  listTasks = async (
    agentId: number,
    region: string,
    status: DeliveryStatus | undefined,
    pagination: PaginationParams,
  ): Promise<{
    data: Array<{
      delivery: DeliveryEntity;
      order: OrderEntity;
      itemsCount: number;
      branchName: string;
      branchAddressText: string;
    }>;
    meta: PaginationMeta;
  }> => {
    const conn = db(region);
    const { data: deliveries, meta } = await findDeliveriesByAgentId(
      conn,
      agentId,
      status,
      pagination,
    );

    const orderIds = deliveries.map((d) => d.orderId);
    const items = await findItemsByOrderIds(conn, orderIds);
    const itemsByOrder = new Map<number, number>();
    for (const item of items) {
      itemsByOrder.set(item.orderId, (itemsByOrder.get(item.orderId) ?? 0) + 1);
    }

    const results = [];
    for (const delivery of deliveries) {
      const order = await this.orderService.getOrderEntityById(
        delivery.orderId,
        region,
      );
      if (!order) continue;
      const branch = await getBranch(order.branchId);
      results.push({
        delivery,
        order,
        itemsCount: itemsByOrder.get(order.id) ?? 0,
        branchName: branch.label,
        branchAddressText: branch.addressText,
      });
    }

    return { data: results, meta };
  };
}
