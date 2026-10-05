// Recently-viewed stashes — a small most-recently-used list surfaced in the
// quick-search overlay so the last few stashes a user opened are one click
// away before they type anything.
//
// Persistence mirrors the `clawstash_favorite_stashes` pattern in
// `favorites.ts`: a JSON-encoded array under a stable localStorage key. Each
// entry stores just the id + a display title (captured at view time). The
// app keeps it in step with the stash: a delete drops the entry
// (`forgetRecentView`) and a rename seen in this browser refreshes its title
// (`syncRecentViewTitle`). A delete or rename made elsewhere (an agent over
// REST / MCP) still leaves a stale entry until the stash is next opened or
// deleted here — acceptable for a convenience list.
//
// Pure helpers (no React) so they can be unit-tested directly and reused.

const STORAGE_KEY = 'clawstash_recent_views';

/** How many recently-viewed stashes to remember. */
export const MAX_RECENT_VIEWS = 5;

export interface RecentView {
  id: string;
  title: string;
}

/**
 * The list entry for a stash. The title mirrors the viewer / card fallback:
 * name, else the first filename, else "Untitled".
 */
export function recentViewOf(stash: {
  id: string;
  name: string;
  files: readonly { filename: string }[];
}): RecentView {
  return { id: stash.id, title: stash.name || stash.files[0]?.filename || 'Untitled' };
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

/**
 * Return a NEW list without the entry for `id`, or the SAME list when it holds
 * no such entry (lets callers skip a pointless write). Pure.
 */
export function removeRecentView(list: readonly RecentView[], id: string): readonly RecentView[] {
  return list.some((v) => v.id === id) ? list.filter((v) => v.id !== id) : list;
}

/**
 * Return a NEW list with the title of `id` replaced in place (its position is
 * kept — seeing a stash change is not the same as opening it), or the SAME list
 * when there is no such entry or the title is unchanged. Pure.
 */
export function renameRecentView(
  list: readonly RecentView[],
  id: string,
  title: string,
): readonly RecentView[] {
  if (!list.some((v) => v.id === id && v.title !== title)) return list;
  return list.map((v) => (v.id === id ? { id, title } : v));
}

/** Drop a deleted stash from the persisted list. No-op when it is not listed. */
export function forgetRecentView(id: string): void {
  const list = loadRecentViews();
  const next = removeRecentView(list, id);
  if (next !== list) saveRecentViews(next);
}

/**
 * Refresh the persisted title of a listed stash after it changed (saved,
 * restored to an older version). No-op when the stash is not listed or the
 * title already matches, so it is cheap to call on every stash load.
 */
export function syncRecentViewTitle(view: RecentView): void {
  const list = loadRecentViews();
  const next = renameRecentView(list, view.id, view.title);
  if (next !== list) saveRecentViews(next);
}
