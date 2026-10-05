// Recent quick-search queries — a short most-recently-used list shown in the
// quick-search overlay while its field is empty, so a repeated search is one
// click instead of retyping it (the overlay resets the field on every open).
//
// A query is only remembered once it led somewhere — a result was opened or
// "Show all" was used — so half-typed or abandoned queries never land here.
//
// Persistence mirrors `recent-views.ts`: a JSON-encoded array under a stable
// localStorage key, pure helpers (no React) so they can be unit-tested.

const STORAGE_KEY = 'clawstash_recent_searches';

/** How many recent queries to remember. */
export const MAX_RECENT_SEARCHES = 5;

/** Longer queries are not remembered — a chip cannot show them usefully. */
export const MAX_RECENT_SEARCH_LENGTH = 100;

/**
 * Read the recent queries from localStorage, newest first. Safe during SSR
 * and on a corrupted / hand-edited value: drops non-string and blank entries
 * and folds case-insensitive duplicates (the chips are keyed by the query).
 */
export function loadRecentSearches(): string[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter((q): q is string => {
        if (typeof q !== 'string' || q.trim() === '') return false;
        const key = q.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

/**
 * Return a NEW list with `query` (trimmed) moved to the front, deduped
 * case-insensitively (the newest spelling wins) and capped at
 * {@link MAX_RECENT_SEARCHES}. A blank or over-long query returns the input
 * unchanged. Pure — the input list is never mutated.
 */
export function addRecentSearch(list: readonly string[], query: string): readonly string[] {
  const q = query.trim();
  if (!q || q.length > MAX_RECENT_SEARCH_LENGTH) return list;
  const key = q.toLowerCase();
  const deduped = list.filter((item) => item.toLowerCase() !== key);
  return [q, ...deduped].slice(0, MAX_RECENT_SEARCHES);
}

/** Persist the list. No-op during SSR / on quota errors. */
export function saveRecentSearches(list: readonly string[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    if (list.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT_SEARCHES)));
  } catch {
    // Quota exceeded / private mode — the list stays in memory only.
  }
}

/** Remember a query that led somewhere: load → prepend → save. Returns the new list. */
export function recordRecentSearch(query: string): readonly string[] {
  const list = loadRecentSearches();
  const next = addRecentSearch(list, query);
  if (next !== list) saveRecentSearches(next);
  return next;
}
