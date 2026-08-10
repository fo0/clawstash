/**
 * Click helpers for in-app links.
 *
 * Stash rows and cards navigate through the SPA router, but they are rendered
 * as real `<a href>` elements so the browser's own "open in a new tab"
 * affordances (Ctrl/Cmd+click, middle-click, Shift+click, context menu) keep
 * working. `isModifiedClick` tells the click handler when to step aside and
 * let the browser handle the navigation itself.
 */

/** The subset of a mouse/click event this module needs — keeps it testable. */
export interface ClickLike {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * True when the click carries a modifier (or is not the primary button), i.e.
 * the user asked the browser for a new tab / new window / download rather than
 * for in-app navigation.
 */
export function isModifiedClick(e: ClickLike): boolean {
  if (typeof e.button === 'number' && e.button !== 0) return true;
  return Boolean(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
}
