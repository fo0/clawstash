// Per-stash favorite (pin-to-top) state.
//
// Persistence model mirrors the existing `clawstash_recent_tags` pattern in
// App.tsx: a JSON-encoded array under a stable localStorage key. We hold the
// in-memory state as a `Set<string>` for O(1) membership checks during render
// and during sort, but always serialize as a plain array.
//
// Pure helpers live here (no React) so they can be unit-tested directly and
// reused by tests + components.

const STORAGE_KEY = 'clawstash_favorite_stashes';

/**
 * Read favorite stash ids from localStorage. Safe to call during SSR
 * (returns empty set if `window` / `localStorage` is unavailable) and on
 * corrupted JSON (returns empty set).
 */
export function loadFavoriteIds(): Set<string> {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return new Set();
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    // Defensive filter: only keep strings — anything else means a corrupted
    // or hand-edited entry, which we silently drop instead of crashing the UI.
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

/**
 * Persist favorite stash ids to localStorage. No-op during SSR.
 */
export function saveFavoriteIds(ids: ReadonlySet<string>): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Quota exceeded / private mode — favorites stay in memory only.
  }
}

/**
 * Return a NEW set with `id` toggled. The input is not mutated, so this is
 * safe to use directly inside a React state updater.
 */
export function toggleFavorite(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}

/**
 * Drop ids that are no longer present in the current stash list. Returns a
 * new set when something was removed, otherwise the original set so callers
 * can short-circuit React re-renders by reference equality.
 */
export function pruneFavoriteIds(
  ids: ReadonlySet<string>,
  knownStashIds: Iterable<string>,
): ReadonlySet<string> {
  const known = knownStashIds instanceof Set ? knownStashIds : new Set(knownStashIds);
  let changed = false;
  const next = new Set<string>();
  for (const id of ids) {
    if (known.has(id)) {
      next.add(id);
    } else {
      changed = true;
    }
  }
  return changed ? next : ids;
}

/**
 * Stable partition: favorites first, non-favorites after, each group preserves
 * the original input order. The dashboard already arrives sorted by
 * `updated_at DESC` from the server, so this lifts favorites to the top
 * without disturbing the underlying order within each group.
 */
export function sortStashesWithFavorites<T extends { id: string }>(
  stashes: readonly T[],
  favoriteIds: ReadonlySet<string>,
): T[] {
  if (favoriteIds.size === 0) return stashes.slice();
  const favorites: T[] = [];
  const others: T[] = [];
  for (const s of stashes) {
    if (favoriteIds.has(s.id)) {
      favorites.push(s);
    } else {
      others.push(s);
    }
  }
  return favorites.concat(others);
}
