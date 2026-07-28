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

import type { StashListItem } from '../db-types';

/**
 * Map a raw `stashes` row to the common list-item shape (without `files` /
 * `total_size`, which the caller fills in after a batch file load).
 *
 * Centralised so the identical mapping in ClawStashDB.listStashes and
 * SearchStore can't drift on field set or coercions when a column is added.
 */
export function rowToStashListItem(
  row: Record<string, unknown>,
): Omit<StashListItem, 'files' | 'total_size'> {
  return {
    id: row.id as string,
    name: (row.name as string) || '',
    description: (row.description as string) || '',
    tags: safeParseTags(row.tags),
    version: (row.version as number) || 1,
    archived: (row.archived as number) === 1,
    backup_enabled: (row.backup_enabled as number) === 1,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

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
 * Hard upper bound on rows returned by one page.
 *
 * The clamp had no maximum, so `?limit=99999` was passed straight to SQLite.
 * The row IDs of a page are then fed back as bound parameters — `WHERE
 * stash_id IN (?, ?, …)` in the batched file loads — and SQLite caps a
 * statement at SQLITE_MAX_VARIABLE_NUMBER (32766) bound parameters, so a
 * large enough page turned a listing into a 500 instead of a page of rows.
 * 1000 is ten times the "max recommended: 100" the tool schema documents, so
 * no realistic caller notices the cap.
 */
export const MAX_PAGE_LIMIT = 1000;

/**
 * Clamp pagination params at the DB layer so callers that bypass the REST
 * route's parsePositiveInt (MCP tool layer, direct DB consumers) cannot
 * produce SQLite OFFSET errors, empty `LIMIT 0` pages, or oversized pages.
 */
export function clampPagination(
  page: unknown,
  limit: unknown,
  defaultLimit: number,
): { page: number; limit: number; offset: number } {
  const safePage = typeof page === 'number' && Number.isInteger(page) && page > 0 ? page : 1;
  const requestedLimit =
    typeof limit === 'number' && Number.isInteger(limit) && limit > 0 ? limit : defaultLimit;
  const safeLimit = Math.min(requestedLimit, MAX_PAGE_LIMIT);
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}
