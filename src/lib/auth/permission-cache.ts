import { cacheProvider } from "../cache/init.ts";
import { getPermissionsByRole } from "../core-client/permission.client.ts";

const FRESH_TTL_SECONDS = 5 * 60;
const STALE_TTL_SECONDS = 60 * 60;

// Read-through cache over core-service's RBAC catalog (this service owns no
// permissions of its own — rbac.md §2). On a core-client failure, serves the
// 1h stale copy if one exists; otherwise the caller denies.
export async function getPermissions(roleName: string): Promise<string[]> {
  const freshKey = `core:rbac:perms:${roleName}`;
  const staleKey = `core:rbac:perms:stale:${roleName}`;

  const cached = await cacheProvider.get(freshKey).catch(() => null);
  if (cached) return JSON.parse(cached);

  try {
    const permissions = await getPermissionsByRole(roleName);
    await cacheProvider
      .set(freshKey, JSON.stringify(permissions), FRESH_TTL_SECONDS)
      .catch(() => {});
    await cacheProvider
      .set(staleKey, JSON.stringify(permissions), STALE_TTL_SECONDS)
      .catch(() => {});
    return permissions;
  } catch (err) {
    const stale = await cacheProvider.get(staleKey).catch(() => null);
    if (stale) return JSON.parse(stale);
    throw err;
  }
}

export function hasPermission(
  permissions: string[],
  resource: string,
  action: string,
): boolean {
  return permissions.includes(`${resource}:${action}`);
}
