/**
 * Shared defensive parsers + pagination clamp for the stash data model.
 *
 * Centralised so the same contract is enforced in every store and on the
 * main ClawStashDB facade. Corrupted JSON in tags / metadata columns must
 * NOT throw out of an endpoint; it falls back to an empty value instead.
 * Pagination clamping protects SQLite (negative OFFSET / LIMIT 0) when a
 * caller bypasses the REST route's `parsePositiveInt`.
 *
 * Behaviour is bit-for-bit identical to the previous inlined copies in
 * db.ts, version-store.ts, and search-store.ts.
 */

export function safeParseTags(raw: unknown): string[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function safeParseMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Clamp pagination params at the DB layer so callers that bypass the REST
 * route's parsePositiveInt (MCP tool layer, direct DB consumers) cannot
 * produce SQLite OFFSET errors or empty `LIMIT 0` pages.
 */
export function clampPagination(
  page: unknown,
  limit: unknown,
  defaultLimit: number,
): { page: number; limit: number; offset: number } {
  const safePage = typeof page === 'number' && Number.isInteger(page) && page > 0 ? page : 1;
  const safeLimit =
    typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : defaultLimit;
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}
