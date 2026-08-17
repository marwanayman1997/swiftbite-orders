import { Knex } from "knex";
import { injectable } from "tsyringe";
import { env } from "../../../lib/config/env.ts";
import { DeliveryEntity } from "../entity/delivery.entity.ts";
import {
  agentHasActiveDelivery,
  createDelivery,
  findCandidateAgents,
} from "../repository/delivery.repo.ts";
import { NoEligibleAgentsError } from "../errors.ts";
// Direct order-module repo access (not via OrderService) is deliberate: this
// write must land in the same trx as the delivery row insert, and
// OrderService already depends on this service (to trigger auto-assignment
// on the ready transition) — injecting OrderService back into this service
// would create a circular DI dependency.
import { setDeliveryAgent } from "../../order/repository/order.repo.ts";
import {
  findNearbyOnlineAgents,
  markAgentBusy,
} from "../../../lib/presence/presence-store.ts";
import { publish } from "../../../lib/websocket/publisher.ts";

export interface AssignmentOrderContext {
  id: number;
  deliveryLat: number;
  deliveryLng: number;
  currency: string;
}

export interface AssignmentBranchContext {
  lat: number;
  lng: number;
}

const CANDIDATE_LIMIT = 5;

// Redis geo set is the hot-path candidate scan; Postgres GIST is the
// fallback when Redis is cold/empty (system-design.md §3 Layer D).
@injectable()
export class AssignmentService {
  tryAssign = async (
    conn: Knex,
    region: string,
    order: AssignmentOrderContext,
    branch: AssignmentBranchContext,
    reassignedFrom?: number,
  ): Promise<DeliveryEntity | null> => {
    let candidates = await findNearbyOnlineAgents(
      region,
      branch.lat,
      branch.lng,
      env.assignment.radiusMeters,
      CANDIDATE_LIMIT,
    ).catch(() => []);

    if (candidates.length === 0) {
      candidates = await findCandidateAgents(
        conn,
        branch.lat,
        branch.lng,
        env.assignment.radiusMeters,
        CANDIDATE_LIMIT,
      );
    }
    if (candidates.length === 0) {
      // No broadcast-mode fallback yet (needs WS, Phase 6) — order stays
      // 'ready'; an admin can manually assign, or a retry lands an agent
      // once one comes online.
      return null;
    }

    const best = candidates[0];
    return this.createAssignment(
      conn,
      region,
      order,
      branch,
      best.agentId,
      best.distanceMeters,
      reassignedFrom,
    );
  };

  assignManual = async (
    conn: Knex,
    region: string,
    order: AssignmentOrderContext,
    branch: AssignmentBranchContext,
    agentId: number,
    reassignedFrom?: number,
  ): Promise<DeliveryEntity> => {
    const busy = await agentHasActiveDelivery(conn, agentId);
    if (busy) throw NoEligibleAgentsError;

    return this.createAssignment(
      conn,
      region,
      order,
      branch,
      agentId,
      null,
      reassignedFrom,
    );
  };

  private createAssignment = async (
    conn: Knex,
    region: string,
    order: AssignmentOrderContext,
    branch: AssignmentBranchContext,
    agentId: number,
    distanceMeters: number | null,
    reassignedFrom?: number,
  ): Promise<DeliveryEntity> => {
    const trx = await conn.transaction();
    try {
      const delivery = await createDelivery(trx, {
        region,
        orderId: order.id,
        agentId,
        pickupLat: branch.lat,
        pickupLng: branch.lng,
        dropoffLat: order.deliveryLat,
        dropoffLng: order.deliveryLng,
        distanceMeters,
        currency: order.currency,
        reassignedFrom,
      });
      await setDeliveryAgent(trx, order.id, agentId);
      await trx.commit();
      await markAgentBusy(region, agentId).catch(() => {});
      // This is the single convergence point for every delivery-creation path
      // (manual assign, auto-assign, reassign, reassign-after-rejection) —
      // implementation-plan.md Phase 6 item 3's "assign -> task.assigned".
      publish(`agent:${agentId}`, "task.assigned", {
        deliveryId: delivery.id,
        orderId: order.id,
        pickupLat: delivery.pickupLat,
        pickupLng: delivery.pickupLng,
        dropoffLat: delivery.dropoffLat,
        dropoffLng: delivery.dropoffLng,
        distanceMeters: delivery.distanceMeters,
        currency: delivery.currency,
      });
      return delivery;
    } catch (err) {
      await trx.rollback();
      throw err;
    }
  };
}
