import { env } from "../config/env.ts";

export const REGIONS: readonly string[] = env.regions.list;

export function isRegion(value: string): boolean {
  return REGIONS.includes(value);
}
