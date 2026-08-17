import { OrderStatus } from "../enums.ts";
import { invalidStatusTransitionError } from "../errors.ts";

export type OrderActor =
  "customer" | "restaurant" | "system" | "agent" | "admin";

interface TransitionRule {
  to: OrderStatus;
  actors: OrderActor[];
}

// Table-driven per business-logic/orders.md §1. "admin" is layered onto every
// restaurant-actionable transition since system_admin bypasses RBAC and
// should be able to do anything a restaurant member can via this endpoint.
const TRANSITIONS: Partial<Record<OrderStatus, TransitionRule[]>> = {
  [OrderStatus.PENDING_PAYMENT]: [
    { to: OrderStatus.CANCELLED, actors: ["customer", "system"] },
  ],
  [OrderStatus.PLACED]: [
    { to: OrderStatus.ACCEPTED, actors: ["restaurant", "admin"] },
    { to: OrderStatus.REJECTED, actors: ["restaurant", "admin"] },
    { to: OrderStatus.CANCELLED, actors: ["customer"] },
  ],
  [OrderStatus.ACCEPTED]: [
    { to: OrderStatus.PREPARING, actors: ["restaurant", "admin"] },
    { to: OrderStatus.CANCELLED, actors: ["restaurant", "admin"] },
  ],
  [OrderStatus.PREPARING]: [
    { to: OrderStatus.READY, actors: ["restaurant", "admin"] },
    { to: OrderStatus.CANCELLED, actors: ["restaurant", "admin"] },
  ],
  [OrderStatus.READY]: [
    { to: OrderStatus.ASSIGNED, actors: ["system"] },
    { to: OrderStatus.CANCELLED, actors: ["restaurant", "admin"] },
  ],
  [OrderStatus.ASSIGNED]: [
    { to: OrderStatus.PICKED, actors: ["agent"] },
    { to: OrderStatus.CANCELLED, actors: ["admin"] },
  ],
  [OrderStatus.PICKED]: [{ to: OrderStatus.DELIVERED, actors: ["agent"] }],
};

export function assertTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: OrderActor,
): void {
  const allowed = TRANSITIONS[from] ?? [];
  const match = allowed.find(
    (rule) => rule.to === to && rule.actors.includes(actor),
  );
  if (!match) {
    throw invalidStatusTransitionError(from, to);
  }
}
