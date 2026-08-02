/**
 * Copy-to-clipboard affordance for fenced code blocks in rendered Markdown.
 *
 * Why the button markup is part of the Markdown HTML blob (and not hydrated
 * into the DOM afterwards, the way inline Mermaid diagrams are):
 * rendered Markdown is injected via a single `dangerouslySetInnerHTML` blob.
 * Nodes that a React effect *adds* to such a subtree are torn down whenever
 * React re-applies the blob — the #286 failure mode. Emitting the button as
 * part of the blob means it is written and re-written together with the code
 * block it belongs to and can never get out of sync with it.
 *
 * The button therefore carries no inline handler (the sanitiser strips `on*`
 * anyway); clicks are picked up by ONE delegated React handler on the
 * container — see `useCodeBlockCopy`. `findCodeCopyTarget` is the shared
 * resolver so markup and handler cannot drift apart.
 *
 * The icon is a CSS mask (`.code-copy-icon`), not an inline `<svg>`, because
 * `sanitizeHtml` strips SVG/foreign content wholesale from Markdown output.
 */

export const CODE_BLOCK_CLASS = 'code-block';
export const CODE_COPY_BTN_CLASS = 'code-copy-btn';
export const CODE_COPY_ICON_CLASS = 'code-copy-icon';

/** Reflects the transient copy result; drives the icon swap in CSS. */
export const CODE_COPY_STATE_ATTR = 'data-copy-state';

export type CodeCopyState = 'copied' | 'failed';

/** Tooltip texts. `aria-label` stays constant — status is announced live. */
export const CODE_COPY_TITLE = 'Copy code to clipboard';
const CODE_COPY_TITLE_COPIED = 'Copied!';
const CODE_COPY_TITLE_FAILED = 'Copy failed';

/**
 * Wrap a rendered `<pre><code>…</code></pre>` block in the copy-button
 * scaffold. Returns `preHtml` unchanged when there is nothing to copy, so
 * empty fences do not sprout a dead button.
 */
export function wrapCodeBlockWithCopy(preHtml: string, code: string): string {
  if (!code.trim()) return preHtml;
  return (
    `<div class="${CODE_BLOCK_CLASS}">` +
    `<button type="button" class="${CODE_COPY_BTN_CLASS}" title="${CODE_COPY_TITLE}" aria-label="${CODE_COPY_TITLE}">` +
    `<span class="${CODE_COPY_ICON_CLASS}" aria-hidden="true"></span>` +
    `</button>` +
    preHtml +
    `</div>`
  );
}

export interface CodeCopyTarget {
  /** The clicked copy button. */
  button: HTMLElement;
  /** Text content of the code block it belongs to. */
  code: string;
}

/**
 * Resolve a click inside a rendered-Markdown container to a copy target.
 *
 * Returns null for every click that is not on a copy button, or on a button
 * that has no code block (user Markdown may contain raw HTML that happens to
 * carry the class — such a button simply does nothing).
 */
export function findCodeCopyTarget(target: Element | null, root: Element): CodeCopyTarget | null {
  if (!target || typeof target.closest !== 'function') return null;
  const button = target.closest<HTMLElement>(`.${CODE_COPY_BTN_CLASS}`);
  if (!button || !root.contains(button)) return null;
  const code = button.closest(`.${CODE_BLOCK_CLASS}`)?.querySelector('pre code');
  if (!code) return null;
  // The renderer appends a trailing newline inside <code>; strip it so the
  // clipboard holds exactly the source the user sees.
  return { button, code: (code.textContent ?? '').replace(/\n$/, '') };
}

/**
 * Apply (or clear) the transient copy feedback on a button.
 *
 * Written straight to the DOM rather than through React state: the button
 * lives inside a `dangerouslySetInnerHTML` blob that React does not own, and
 * the feedback is short-lived by design.
 */
export function setCodeCopyState(button: HTMLElement, state: CodeCopyState | null): void {
  if (!state) {
    button.removeAttribute(CODE_COPY_STATE_ATTR);
    button.setAttribute('title', CODE_COPY_TITLE);
    return;
  }
  button.setAttribute(CODE_COPY_STATE_ATTR, state);
  button.setAttribute(
    'title',
    state === 'copied' ? CODE_COPY_TITLE_COPIED : CODE_COPY_TITLE_FAILED,
  );
}
