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

/**
 * SMIL animation elements, removed wholesale rather than attribute-filtered.
 *
 * `<animate attributeName="href" values="javascript:alert(1)" />` rewrites its
 * target's attribute AFTER this sanitiser has inspected it, so the `on*` and
 * URL-scheme checks below cannot see the payload — the same bypass that
 * `sanitizeHtml()` in `utils/markdown.ts` already strips for the Markdown
 * surface. SMIL is native to SVG (unlike the HTML fragments Markdown emits),
 * which makes this the surface where the vector actually works.
 *
 * Mermaid animates edges through CSS classes and emits no SMIL, so removing
 * these elements does not change any diagram this app renders.
 *
 * Matched on the lowercased tag name so the camelCase SVG spellings
 * (`animateTransform`, `animateMotion`) are caught however the parser
 * normalised them.
 */
const ANIMATION_ELEMENTS = new Set(['animate', 'animatetransform', 'animatemotion', 'set']);

/**
 * URL schemes that execute instead of addressing a resource.
 *
 * `data:image/svg+xml` is listed alongside the two script schemes and
 * `data:text/html` because an SVG document carries its own script context: the
 * payload is markup this sanitiser never inspects (it lives inside an opaque,
 * possibly base64-encoded attribute value), so the `on*` and element checks
 * below cannot reach it. `isUnsafeUrl()` in `utils/markdown.ts` already rejects
 * it on the Markdown surface — and both modules document that the two
 * normalisations are deliberately kept in step, so a scheme blocked on one
 * surface must not survive on the other.
 *
 * Raster data URIs (`data:image/png`, `data:image/jpeg`, …) stay allowed: they
 * cannot carry script, and blocking every `data:` URI could strip a legitimate
 * inline icon out of a diagram. Mermaid emits no `data:` URIs at all today, so
 * this is defence-in-depth against a future producer, not a change to how any
 * diagram currently renders.
 */
const UNSAFE_URL = /^(?:javascript|vbscript|data:text\/html|data:image\/svg\+xml)/;

/** Attributes carrying a URL that must not be a script URL. */
const URL_ATTRS = new Set(['href', 'xlink:href', 'src', 'action', 'formaction']);

/**
 * True when an attribute value carries a script-bearing URL scheme.
 *
 * Browsers ignore ASCII control characters and whitespace while resolving a
 * URL, so `jav&#9;ascript:alert(1)` — which the HTML parser decodes into a
 * literal TAB *inside* the scheme — still executes. A pattern anchored on the
 * raw value only catches LEADING whitespace and lets that through, so strip
 * every control char and space first and match the lowercased remainder. This
 * is the same normalisation `isUnsafeUrl()` in `utils/markdown.ts` applies to
 * the Markdown surface; keeping the two in step means an obfuscated scheme
 * cannot survive on one surface after being blocked on the other.
 *
 * Only a copy is inspected — the attribute value itself is never rewritten.
 */
function isUnsafeUrlValue(value: string): boolean {
  // Strip ASCII control chars + whitespace (0x00-0x20) and DEL (0x7F).
  // eslint-disable-next-line no-control-regex
  return UNSAFE_URL.test(value.replace(/[\x00-\x20\x7f]/g, '').toLowerCase());
}

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
    if (ANIMATION_ELEMENTS.has(el.tagName.toLowerCase())) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || (URL_ATTRS.has(name) && isUnsafeUrlValue(attr.value))) {
        el.removeAttribute(attr.name);
      }
    }
  }

  return root.innerHTML;
}
