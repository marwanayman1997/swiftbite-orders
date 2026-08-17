import { inject, injectable } from "tsyringe";
import { db } from "../../../lib/knex/knex.ts";
import { TOKENS } from "../../../lib/di/tokens.ts";
import { DeliveryService } from "../../delivery/service/delivery.service.ts";
import { OrderService } from "../../order/service/order.service.ts";
import { DeliveryStatus } from "../../delivery/enums.ts";
import { findActiveDeliveryByAgentId } from "../../delivery/repository/delivery.repo.ts";
import { AgentInActiveDeliveryError, NotOnlineError } from "../errors.ts";
import {
  findAgentPresence,
  pingAgentPresence,
  setAgentPresenceOffline,
  upsertAgentOnline,
} from "../repository/agent-presence.repo.ts";
import * as presenceStore from "../../../lib/presence/presence-store.ts";
import { publish } from "../../../lib/websocket/publisher.ts";

@injectable()
export class PresenceService {
  constructor(
    @inject(TOKENS.DeliveryService)
    private readonly deliveryService: DeliveryService,
    @inject(TOKENS.OrderService) private readonly orderService: OrderService,
  ) {}

  online = async (
    agentId: number,
    region: string,
    lat: number,
    lng: number,
  ): Promise<void> => {
    const conn = db(region);
    await upsertAgentOnline(conn, agentId, region, lat, lng);
    await presenceStore.setAgentOnline(region, agentId, lat, lng);
  };

  offline = async (agentId: number, region: string): Promise<void> => {
    const conn = db(region);
    const active = await findActiveDeliveryByAgentId(conn, agentId);
    if (active && active.status === DeliveryStatus.PICKED) {
      throw AgentInActiveDeliveryError;
    }

    // Offline the agent BEFORE triggering reassignment, so the candidate
    // scan correctly excludes them rather than reassigning back to
    // themselves.
    await setAgentPresenceOffline(conn, agentId);
    await presenceStore.setAgentOffline(region, agentId);

    if (active) {
      const order = await this.orderService.getOrderEntityById(
        active.orderId,
        region,
      );
      if (order) {
        await this.deliveryService
          .reassign(order.publicId, region)
          .catch(() => {});
      }
    }
  };

  ping = async (
    agentId: number,
    region: string,
    lat: number,
    lng: number,
  ): Promise<void> => {
    const conn = db(region);
    const presence = await findAgentPresence(conn, agentId);
    if (!presence || !presence.isOnline) {
      throw NotOnlineError;
    }
    await pingAgentPresence(conn, agentId, lat, lng);
    await presenceStore.pingAgent(region, agentId, lat, lng);

    const active = await findActiveDeliveryByAgentId(conn, agentId);
    if (active) {
      const order = await this.orderService.getOrderEntityById(
        active.orderId,
        region,
      );
      if (order) {
        publish(`customer:${order.customerId}`, "delivery.position", {
          deliveryId: active.id,
          orderPublicId: order.publicId,
          lat,
          lng,
        });
      }
    }
  };
}
