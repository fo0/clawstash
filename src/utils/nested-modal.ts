/**
 * Tell a modal the app opened apart from user-authored markup that only
 * looks like one.
 *
 * `sanitizeHtml` keeps `role`, `aria-*` and `data-*`, so a stash file or
 * description written in Markdown can carry its own `<div role="dialog">` or
 * `aria-modal="true"`. A modal that steps aside for a nested one (Escape,
 * the Tab trap) would then stand down for a plain `<div>` in the content.
 * Rendered Markdown is the only place user HTML lands in the app's own
 * document — the HTML preview is a separate iframe document and raw code is
 * escaped — so a match inside one of these containers never counts.
 */
const USER_HTML_SELECTOR = '.markdown-body, .markdown-description';

const APP_MODAL_SELECTOR = '[aria-modal="true"]';

function isAppOwned(el: Element): boolean {
  return el.closest(USER_HTML_SELECTOR) === null;
}

/**
 * Whether a descendant of `container` matching `selector` (e.g.
 * `[role="dialog"]`) is an app-owned modal rather than rendered Markdown.
 * Descendants only: the container never matches itself.
 */
export function containsAppModal(container: ParentNode, selector: string): boolean {
  return Array.from(container.querySelectorAll(selector)).some(isAppOwned);
}

/** Whether `el` sits inside an app-owned `aria-modal="true"` element. */
export function isInsideAppModal(el: Element): boolean {
  for (
    let modal = el.closest(APP_MODAL_SELECTOR);
    modal !== null;
    modal = modal.parentElement?.closest(APP_MODAL_SELECTOR) ?? null
  ) {
    if (isAppOwned(modal)) return true;
  }
  return false;
}
