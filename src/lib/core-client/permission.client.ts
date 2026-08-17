import { coreClientGet } from "./core-client.ts";

export async function getPermissionsByRole(
  roleName: string,
): Promise<string[]> {
  const result = await coreClientGet<{ role: string; permissions: string[] }>(
    `/api/internal/rbac/permissions?role=${encodeURIComponent(roleName)}`,
  );
  return result.permissions;
}
