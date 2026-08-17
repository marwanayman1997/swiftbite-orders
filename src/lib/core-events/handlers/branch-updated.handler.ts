import { cacheProvider } from "../../cache/init.ts";

export interface BranchUpdatedPayload {
  branchId: number;
  isActive?: boolean;
}

export async function handleBranchUpdated(
  payload: BranchUpdatedPayload,
): Promise<void> {
  await cacheProvider.del(`core:branch:${payload.branchId}`);
  if (payload.isActive === true) {
    await cacheProvider.del(`branch:reject-orders:${payload.branchId}`);
  }
}
