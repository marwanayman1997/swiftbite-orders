import type { Socket } from "socket.io";
import type { JwtPayload } from "../auth/jwt.ts";
import { getBranch } from "../core-client/branch.client.ts";

export function extractToken(socket: Socket): string | undefined {
  const authToken = (socket.handshake.auth as Record<string, unknown>)?.token;
  if (typeof authToken === "string") return authToken;

  const queryToken = socket.handshake.query?.token;
  if (typeof queryToken === "string") return queryToken;

  const cookieHeader = socket.handshake.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/access_token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  return undefined;
}

// customer -> customer:<userId>; restaurant_user -> restaurant:<restaurantId>
// + branch:<branchId> per assigned branch; delivery_agent -> agent:<userId>;
// system_admin -> a single shared admin:alerts broadcast channel.
export function deriveAllowedChannels(user: JwtPayload): string[] {
  const channels: string[] = [];

  if (user.role === "customer") {
    channels.push(`customer:${user.userId}`);
  }

  if (user.role === "restaurant_user" && user.restaurantId) {
    channels.push(`restaurant:${user.restaurantId}`);
    // Owners never get explicit member_branches rows (they implicitly own
    // every branch under their restaurant — see requireBranchAccess's
    // REST-side owner bypass for the same reasoning), so branchIds is
    // always empty for them here. Their branch:<id> access is verified
    // dynamically at subscribe time instead — see isChannelAllowed below.
    for (const branchId of user.branchIds ?? []) {
      channels.push(`branch:${branchId}`);
    }
  }

  if (user.role === "delivery_agent") {
    channels.push(`agent:${user.userId}`);
  }

  if (user.role === "system_admin") {
    channels.push("admin:alerts");
  }

  return channels;
}

const BRANCH_CHANNEL = /^branch:(\d+)$/;

// Static allowed list first (cheap, synchronous); falls through to a
// dynamic ownership check for the one case the static list can't cover —
// a restaurant owner subscribing to a specific branch:<id> channel. Mirrors
// the same check order.service.ts's listRestaurantOrders already does on
// the REST side (actor.restaurantRole === "owner" + live branch lookup),
// so WS access matches REST access instead of being stricter for owners.
export async function isChannelAllowed(
  user: JwtPayload,
  allowed: string[],
  channel: string,
): Promise<boolean> {
  if (allowed.includes(channel)) return true;

  if (
    user.role !== "restaurant_user" ||
    user.restaurantRole !== "owner" ||
    !user.restaurantId
  ) {
    return false;
  }

  const match = channel.match(BRANCH_CHANNEL);
  if (!match) return false;

  try {
    const branch = await getBranch(Number(match[1]));
    return Number(branch.restaurantId) === Number(user.restaurantId);
  } catch {
    // Branch lookup failed (core-service down, unknown id, etc.) — fail
    // closed, same as every other permission check in this file.
    return false;
  }
}
