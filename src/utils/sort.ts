// Dashboard sort-order state + pure sort helper.
//
// Persistence mirrors the `clawstash_layout` pattern in App.tsx: a single
// string value under a stable localStorage key. The sort itself is a pure,
// React-free function so it can be unit-tested directly and reused.
//
// Sort runs BEFORE the favorites partition (`sortStashesWithFavorites`), so
// pinned stashes stay on top while the rest follow the chosen order.

import type { SortMode, StashListItem } from '../types';

const STORAGE_KEY = 'clawstash_sort';

/** All valid sort modes paired with a human label, for rendering the picker. */
export const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'created', label: 'Recently created' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'size', label: 'Largest first' },
];

const VALID_MODES: ReadonlySet<string> = new Set(SORT_OPTIONS.map((o) => o.value));

function isSortMode(value: unknown): value is SortMode {
  return typeof value === 'string' && VALID_MODES.has(value);
}

/**
 * Read the persisted sort mode from localStorage. Safe during SSR and on a
 * missing / corrupted / hand-edited value (falls back to `'updated'`, which
 * matches the server's default `updated_at DESC` order).
 */
export function loadSortMode(): SortMode {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return 'updated';
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isSortMode(raw) ? raw : 'updated';
  } catch {
    return 'updated';
  }
}

/** Persist the sort mode to localStorage. No-op during SSR / on quota errors. */
export function saveSortMode(mode: SortMode): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Quota exceeded / private mode — sort stays in memory only.
  }
}

// Parse an ISO date to epoch millis; unparseable dates sort to the bottom for
// date-based orders (NaN-safe: treated as 0 / oldest).
function timeOf(dateStr: string): number {
  const t = new Date(dateStr).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Return a NEW array of stashes ordered by `mode`. The input is never mutated.
 *
 * - `updated` / `created`: newest first (descending timestamp)
 * - `name`: case-insensitive A–Z; falls back to the first filename, then ''
 * - `size`: largest `total_size` first
 *
 * Comparisons are stable-friendly: ties fall back to `id` so the order is
 * deterministic across renders (Array.prototype.sort is stable in modern
 * engines, but the id tiebreak keeps results identical regardless of input
 * order — important since the server order can shift between fetches).
 */
export function sortStashes(stashes: readonly StashListItem[], mode: SortMode): StashListItem[] {
  const byId = (a: StashListItem, b: StashListItem) => a.id.localeCompare(b.id);
  const copy = stashes.slice();

  switch (mode) {
    case 'created':
      return copy.sort((a, b) => timeOf(b.created_at) - timeOf(a.created_at) || byId(a, b));
    case 'name':
      return copy.sort((a, b) => {
        const an = (a.name || a.files[0]?.filename || '').toLowerCase();
        const bn = (b.name || b.files[0]?.filename || '').toLowerCase();
        return an.localeCompare(bn) || byId(a, b);
      });
    case 'size':
      return copy.sort((a, b) => b.total_size - a.total_size || byId(a, b));
    case 'updated':
    default:
      return copy.sort((a, b) => timeOf(b.updated_at) - timeOf(a.updated_at) || byId(a, b));
  }
}
