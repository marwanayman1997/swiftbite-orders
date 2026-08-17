import { Knex } from "knex";

export interface PaginationParams {
  cursor?: string;
  limit: number;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

export interface FilterParams {
  field: string;
  operator: "eq" | "gt" | "lt" | "lte" | "gte" | "in" | "like";
  value: string | string[];
}

export interface PaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

const CURSOR_SEPARATOR = "::";

function encodeCursor(value: string, id: number | string): string {
  return `${value}${CURSOR_SEPARATOR}${id}`;
}

function decodeCursor(cursor: string): [string, string] {
  const idx = cursor.lastIndexOf(CURSOR_SEPARATOR);
  if (idx === -1) return [cursor, "0"];
  return [cursor.slice(0, idx), cursor.slice(idx + CURSOR_SEPARATOR.length)];
}

const ISO_MS_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

export function applyCursorPagination<T>(
  query: Knex.QueryBuilder,
  params: PaginationParams,
  conn: Knex,
  idField = "id",
): Knex.QueryBuilder {
  if (!params.sortBy) {
    return query;
  }
  if (params.cursor) {
    const [cursorValue, cursorId] = decodeCursor(params.cursor);
    const op = params.sortOrder === "asc" ? ">" : "<";
    const isDateCursor = ISO_MS_DATE.test(cursorValue);
    const sortExpr: any = isDateCursor
      ? conn.raw("date_trunc('milliseconds', ??)", [params.sortBy])
      : params.sortBy;
    const compareValue: any = isDateCursor
      ? new Date(cursorValue)
      : cursorValue;

    query = query.where((builder) => {
      builder.where(sortExpr, op, compareValue).orWhere((tie) => {
        tie.where(sortExpr, compareValue).andWhere(idField, op, cursorId);
      });
    });
  }

  return query
    .orderBy(params.sortBy, params.sortOrder)
    .orderBy(idField, params.sortOrder)
    .limit(params.limit + 1);
}

export function applyFilters<T>(
  query: Knex.QueryBuilder,
  filters: FilterParams[],
): Knex.QueryBuilder {
  for (const filter of filters) {
    switch (filter.operator) {
      case "eq":
        query.where(filter.field, filter.value);
        break;
      case "gt":
        query.where(filter.field, ">", filter.value);
        break;
      case "lt":
        query.where(filter.field, "<", filter.value);
        break;
      case "lte":
        query.where(filter.field, "<=", filter.value);
        break;
      case "gte":
        query.where(filter.field, ">=", filter.value);
        break;
      case "like":
        query.whereLike(filter.field, `%${filter.value}%`);
        break;
      case "in":
        query.whereIn(
          filter.field,
          Array.isArray(filter.value) ? filter.value : [filter.value],
        );
        break;
    }
  }
  return query;
}

export function buildPaginationResult<T>(
  rows: T[],
  limit: number,
  sortBy: string,
  idField = "id",
): { data: T[]; meta: PaginationMeta } {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  let nextCursor = null;

  if (hasMore && data.length > 0) {
    const lastItem = data[data.length - 1] as any;
    const resultKey = sortBy.includes(".") ? sortBy.split(".").pop()! : sortBy;
    const idResultKey = idField.includes(".")
      ? idField.split(".").pop()!
      : idField;
    const rawValue = lastItem[resultKey];
    const cursorValue =
      rawValue instanceof Date ? rawValue.toISOString() : String(rawValue);
    nextCursor = encodeCursor(cursorValue, lastItem[idResultKey]);
  }
  return {
    data,
    meta: {
      nextCursor: nextCursor,
      hasMore: hasMore,
      count: data.length,
    },
  };
}
