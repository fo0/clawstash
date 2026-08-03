/**
 * Platform detection for keyboard-shortcut labels.
 *
 * Pure and SSR-safe: everything here returns the non-Mac answer when there is
 * no `navigator`, so a server render and the first client render agree. The
 * mounted-only refinement lives in `hooks/useQuickSearchHint.ts`.
 */

/** Modifier label for the quick-search accelerator on non-Apple platforms. */
export const QUICK_SEARCH_HINT_DEFAULT = 'Ctrl+K';

/** Modifier label for the quick-search accelerator on Apple platforms. */
export const QUICK_SEARCH_HINT_MAC = '⌘K';

/**
 * True on macOS / iPadOS / iOS, where the command key carries the accelerator.
 *
 * `navigator.platform` is deprecated but still the most reliable signal, so it
 * is consulted after the modern `userAgentData.platform` hint and before the
 * user-agent string. Returns false during SSR.
 */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const source = uaData?.platform || navigator.platform || navigator.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(source);
}

/**
 * Label for the quick-search accelerator — "⌘K" on Apple platforms, "Ctrl+K"
 * elsewhere. The platform is injectable so the label is testable without
 * stubbing `navigator`.
 */
export function quickSearchHint(mac: boolean = isMacPlatform()): string {
  return mac ? QUICK_SEARCH_HINT_MAC : QUICK_SEARCH_HINT_DEFAULT;
}
