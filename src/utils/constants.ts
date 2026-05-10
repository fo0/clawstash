/**
 * App-wide UI timing constants (milliseconds).
 *
 * Centralised so the same intent (debounce, toast, confirm) is tuned once
 * across all consumers. Module-scoped per-component constants stay where
 * they are (e.g. mermaid animation, mermaid zoom-persist debounce, session
 * cleanup interval, version cache TTL).
 */

/** Search input debounce window — sidebar live-search and search overlay. */
export const SEARCH_DEBOUNCE_MS = 200;

/** Auto-dismiss for "copied" / "copy failed" toast feedback. */
export const COPY_TOAST_DURATION_MS = 2000;

/**
 * Two-click destructive-action confirm timeout — used by delete and restore
 * flows that ask the user to click twice within this window to commit.
 */
export const DELETE_CONFIRM_TIMEOUT_MS = 3000;
