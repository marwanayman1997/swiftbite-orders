import { PaginationParams, FilterParams } from "./cursor-pagination.ts";

export interface PaginationQueryOptions {
  allowedSortFields: string[];
  defaultSortBy: string;
  defaultLimit?: number;
}

export function parsePaginationQuery(
  query: Record<string, any>,
  options: PaginationQueryOptions,
): PaginationParams {
  const { allowedSortFields, defaultSortBy, defaultLimit = 20 } = options;

  const rawLimit = Number(query.limit);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(1000, rawLimit)
      : defaultLimit;

  const requestedSortBy = query.sortBy as string;
  const sortBy = allowedSortFields.includes(requestedSortBy)
    ? requestedSortBy
    : defaultSortBy;

  return {
    cursor: query.cursor as string,
    limit,
    sortBy,
    sortOrder: query.sortOrder === "desc" ? "desc" : "asc",
  };
}

export function parseFilters(
  query: Record<string, any>,
  allowedFields: string[],
): FilterParams[] {
  const filter = query.filter;
  if (!filter || typeof filter !== "object") return [];

  const allowedOps = new Set(["eq", "gt", "lt", "gte", "lte", "like", "in"]);

  return allowedFields.flatMap((field) => {
    const fieldFilters = filter[field];
    if (!fieldFilters || typeof fieldFilters !== "object") return [];

    return Object.entries(fieldFilters)
      .filter(([op]) => allowedOps.has(op))
      .map(([operator, value]) => ({
        field,
        operator: operator as FilterParams["operator"],
        value: value as string | string[],
      }));
  });
}
