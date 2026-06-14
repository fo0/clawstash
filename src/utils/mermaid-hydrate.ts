/**
 * Inline Mermaid hydration for rendered Markdown.
 *
 * The Markdown `code` renderer emits, for each ```mermaid``` block, a
 * `<div class="mermaid-placeholder" data-mermaid-source="BASE64">`. These can
 * sit anywhere in the rendered HTML — including nested inside a sanitised
 * `<table>` for side-by-side layouts — so we keep the surrounding markup
 * untouched (a single `dangerouslySetInnerHTML` blob) and only fill in each
 * placeholder.
 *
 * Why a plain DOM helper and not a React component / portal:
 *   - Splitting the HTML blob to interleave components breaks nested
 *     placeholders (you cannot cut a string in the middle of a `<table>`).
 *   - Portaling a component INTO a node that lives inside a
 *     `dangerouslySetInnerHTML` subtree makes React re-create that subtree on
 *     every parent re-render, detaching the portal — verified, it does not
 *     work.
 *
 * The historical bug (#286): diagrams rendered blank on a full page load / F5
 * but fine via SPA navigation. Root cause — the hydration write was gated by a
 * React-effect `cancelled` flag, so a re-render during page boot could cancel
 * the in-flight render and the write never landed (and never retried), leaving
 * the placeholder permanently empty.
 *
 * This helper fixes that by construction:
 *   - It claims each placeholder SYNCHRONOUSLY (`data-mermaid-rendered`), so it
 *     is idempotent and safe to call on every render — re-entrant calls skip
 *     in-flight nodes.
 *   - The SVG write happens when the (lazy, async) render resolves, guarded
 *     ONLY by `document.contains(el)`. It is not tied to any React lifecycle,
 *     so it cannot be orphaned. If a re-render replaced the node, the write is
 *     skipped and the fresh (unclaimed) placeholder is picked up by the next
 *     call.
 */
import { renderMermaid } from './mermaid';
import { escapeHtml } from './html';

const RENDERED_ATTR = 'data-mermaid-rendered';

/**
 * Base64-encode a UTF-8 string for safe embedding in a `data-*` attribute.
 * Uses TextEncoder/btoa via a binary string round-trip so multi-byte chars
 * survive correctly without relying on the deprecated `escape`/`unescape`
 * globals (removed in strict ECMAScript and flagged by modern lints).
 */
export function encodeMermaidSource(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Inverse of `encodeMermaidSource`. */
export function decodeMermaidSource(s: string): string {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function writeError(el: HTMLElement, message: string, source?: string): void {
  el.innerHTML =
    `<div class="mermaid-error" role="alert">` +
    `<div class="mermaid-error-title"><strong>Mermaid syntax error</strong></div>` +
    `<div class="mermaid-error-message">${escapeHtml(message)}</div>` +
    (source === undefined ? '' : `<pre class="mermaid-error-source">${escapeHtml(source)}</pre>`) +
    `</div>`;
}

/**
 * Render every not-yet-claimed inline `.mermaid-placeholder` under `root`.
 *
 * Idempotent and safe to call on every render. See the module comment for the
 * #286 rationale (orphan-proof writes).
 */
export function hydrateMermaidPlaceholders(root: ParentNode): void {
  const placeholders = root.querySelectorAll<HTMLElement>(
    `.mermaid-placeholder:not([${RENDERED_ATTR}])`,
  );
  placeholders.forEach((el) => {
    // Claim synchronously so a re-entrant call (effect re-run) skips this node
    // while its render is still in flight.
    el.setAttribute(RENDERED_ATTR, '1');

    let source: string;
    try {
      source = decodeMermaidSource(el.getAttribute('data-mermaid-source') || '');
    } catch {
      writeError(el, 'Invalid source encoding');
      return;
    }

    renderMermaid(source).then((result) => {
      // Only the live node matters; a re-render may have replaced `el`. The
      // replacement carries no claim attribute and is handled by the next call.
      if (!document.contains(el)) return;
      if (result.svg) {
        el.innerHTML = result.svg;
        el.classList.add('mermaid-diagram');
      } else {
        writeError(el, result.error || 'Unknown error', source);
      }
    });
  });
}
