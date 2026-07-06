// Recently-viewed stashes — a small most-recently-used list surfaced in the
// quick-search overlay so the last few stashes a user opened are one click
// away before they type anything.
//
// Persistence mirrors the `clawstash_favorite_stashes` pattern in
// `favorites.ts`: a JSON-encoded array under a stable localStorage key. Each
// entry stores just the id + a display title (captured at view time). The
// title may go stale if the stash is later renamed or deleted — that is an
// acceptable trade-off for a convenience list: a deleted entry simply surfaces
// the existing "failed to load" toast when clicked.
//
// Pure helpers (no React) so they can be unit-tested directly and reused.

const STORAGE_KEY = 'clawstash_recent_views';

/** How many recently-viewed stashes to remember. */
export const MAX_RECENT_VIEWS = 5;

export interface RecentView {
  id: string;
  title: string;
}

/** Type guard for a single persisted entry (defends against hand-edited JSON). */
function isRecentView(value: unknown): value is RecentView {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RecentView).id === 'string' &&
    typeof (value as RecentView).title === 'string'
  );
}

/**
 * Read the recently-viewed list from localStorage, newest first. Safe during
 * SSR (returns `[]` when `window` / `localStorage` is unavailable) and on a
 * corrupted / hand-edited value (drops non-conforming entries).
 */
export function loadRecentViews(): RecentView[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentView).slice(0, MAX_RECENT_VIEWS);
  } catch {
    return [];
  }
}

/**
 * Return a NEW list with `view` moved to the front (deduped by id) and capped
 * at {@link MAX_RECENT_VIEWS}. Pure — the input list is never mutated.
 */
export function addRecentView(list: readonly RecentView[], view: RecentView): RecentView[] {
  const deduped = list.filter((v) => v.id !== view.id);
  return [view, ...deduped].slice(0, MAX_RECENT_VIEWS);
}

/** Persist the recently-viewed list to localStorage. No-op during SSR / on quota errors. */
export function saveRecentViews(list: readonly RecentView[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT_VIEWS)));
  } catch {
    // Quota exceeded / private mode — the list stays in memory only.
  }
}

/**
 * Record a viewed stash: load → prepend (deduped, capped) → save. Returns the
 * updated list so callers can reuse it without a second read.
 */
export function recordRecentView(view: RecentView): RecentView[] {
  const next = addRecentView(loadRecentViews(), view);
  saveRecentViews(next);
  return next;
}
