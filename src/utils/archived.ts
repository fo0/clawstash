// Persistence for the dashboard "show archived stashes" toggle.
//
// Mirrors the `clawstash_layout` / `clawstash_sort` pattern: a single string
// value ('1' | '0') under a stable localStorage key, with SSR- and
// quota-safe getters/setters. Keeping it here (React-free) lets it be
// unit-tested directly and reused without dragging in component state.
//
// Default is `false` (hide archived) to match the server default and the
// prior in-memory behaviour, so an unset / corrupted value is harmless.

const STORAGE_KEY = 'clawstash_archived';

/**
 * Read the persisted "show archived" preference from localStorage. Safe during
 * SSR and on a missing / corrupted value (falls back to `false`, i.e. hide
 * archived — the server default).
 */
export function loadShowArchived(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return false;
  }
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the "show archived" preference. No-op during SSR / on quota errors. */
export function saveShowArchived(show: boolean): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, show ? '1' : '0');
  } catch {
    // Quota exceeded / private mode — preference stays in memory only.
  }
}
