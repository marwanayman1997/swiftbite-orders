import { cacheProvider } from "../../cache/init.ts";

export interface BranchDeactivatedPayload {
  branchId: number;
}

const REJECT_ORDERS_TTL_SECONDS = 24 * 60 * 60;

export async function handleBranchDeactivated(
  payload: BranchDeactivatedPayload,
): Promise<void> {
  await cacheProvider.del(`core:branch:${payload.branchId}`);
  await cacheProvider.set(
    `branch:reject-orders:${payload.branchId}`,
    "1",
    REJECT_ORDERS_TTL_SECONDS,
  );
}
