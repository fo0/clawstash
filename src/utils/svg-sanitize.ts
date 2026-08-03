/**
 * Defense-in-depth sanitizer for SVG markup that is handed to
 * `dangerouslySetInnerHTML` (today: rendered Mermaid diagrams).
 *
 * Mermaid is initialized with `securityLevel: 'strict'`, so its own renderer
 * already escapes user text and drops click bindings — this pass is the second
 * line of defense, not the first. It exists so a future Mermaid regression, a
 * new diagram type, or a different SVG producer cannot turn stash content into
 * script execution.
 *
 * Implementation notes:
 * - Parsing goes through `DOMParser` with `text/html`, which yields an INERT
 *   document: scripts do not run and no subresource (`<img src>`, `<use href>`)
 *   is fetched while we inspect it. Building the DOM via `innerHTML` on a
 *   detached element would NOT be inert — an `<img onerror>` can fire there.
 * - `text/html` (not `image/svg+xml`) on purpose: the HTML parser is lenient
 *   and handles the HTML fragments Mermaid emits inside `<foreignObject>`,
 *   while its foreign-content rules restore the camelCase SVG attribute names
 *   (`viewBox`, `markerWidth`, …). It is also exactly the parser React uses
 *   when the string is injected, so the round-trip does not change rendering.
 * - Nothing is allowlisted: `<style>`, gradients, markers and foreignObject
 *   content all survive. Only executable vectors are removed.
 */

/** Elements that can execute code or load an unrelated document. */
const FORBIDDEN_ELEMENTS = 'script, iframe, object, embed, base, link, meta';

/** URL schemes that execute instead of addressing a resource. */
const UNSAFE_URL = /^\s*(?:javascript|vbscript|data:text\/html)/i;

/** Attributes carrying a URL that must not be a script URL. */
const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction']);

/**
 * Strip script elements, inline event handlers (`on*`) and script URLs from an
 * SVG string. Returns the sanitized markup; input is never mutated.
 *
 * Outside a DOM environment (SSR, node tests) the input is returned unchanged —
 * the string is inert until a browser injects it, and every caller runs
 * client-side.
 */
export function sanitizeSvg(svg: string): string {
  if (typeof DOMParser === 'undefined') return svg;

  const doc = new DOMParser().parseFromString(`<div>${svg}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  root.querySelectorAll(FORBIDDEN_ELEMENTS).forEach((el) => el.remove());

  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || (URL_ATTRS.has(name) && UNSAFE_URL.test(attr.value))) {
        el.removeAttribute(attr.name);
      }
    }
  }

  return root.innerHTML;
}
