import { sql, type SQL } from "drizzle-orm";

/**
 * Parse pagination params from URL search params with safe defaults.
 */
export function parsePagination(
  url: URL,
  defaults: { limit?: number; maxLimit?: number } = {},
): { limit: number; offset: number } {
  const maxLimit = defaults.maxLimit ?? 100;
  const defaultLimit = defaults.limit ?? 50;
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || String(defaultLimit)) || defaultLimit, maxLimit));
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0") || 0);
  return { limit, offset };
}

/**
 * Typed count query helper — avoids repeating `sql<number>\`count(*)::int\`` everywhere.
 */
export function countSql(): SQL<number> {
  return sql<number>`count(*)::int`;
}
