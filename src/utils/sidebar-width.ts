// Persisted width of the desktop sidebar. The list it holds shows stash names,
// tags and file counts in a column that was fixed at 260px, so long names were
// truncated for everyone regardless of how much screen they had.
//
// Persistence mirrors the `clawstash-*` preference pattern used by the viewer's
// wrap / render toggles: a single plain value under a stable localStorage key.
// Pure helpers (no React) so they can be unit-tested directly.

const STORAGE_KEY = 'clawstash-sidebar-width';

/** Default and bounds, in CSS pixels. */
export const SIDEBAR_DEFAULT_WIDTH = 260;
/** Below this the search field and the tag filter stop fitting side by side. */
export const SIDEBAR_MIN_WIDTH = 200;
/** Above this the sidebar starts crowding out the content it navigates. */
export const SIDEBAR_MAX_WIDTH = 520;

/** Round to a whole pixel and hold the value inside the supported range. */
export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

/**
 * Read the stored width. Safe during SSR and on a corrupted / hand-edited
 * value — anything unparseable falls back to the default rather than
 * collapsing the sidebar.
 */
export function loadSidebarWidth(): number {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return SIDEBAR_DEFAULT_WIDTH;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT_WIDTH;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? SIDEBAR_DEFAULT_WIDTH : clampSidebarWidth(parsed);
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

/** Persist the width. A failing write (private mode, full quota) is ignored. */
export function saveSidebarWidth(width: number): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(clampSidebarWidth(width)));
  } catch {
    /* preference is best-effort */
  }
}
