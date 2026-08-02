import { Marked } from 'marked';
import { escapeHtml } from './html';
import { wrapCodeBlockWithCopy } from './code-copy';

/**
 * Test whether an attribute value carries a script-bearing URL scheme.
 *
 * Browsers tolerate leading ASCII whitespace, embedded control chars, mixed
 * case, and HTML-entity-encoded characters in href/src values, so a naive
 * `value.startsWith('javascript:')` check is bypassed by inputs like
 * `JaVaScRiPt:alert(1)` or a tab/newline preceding the scheme.
 *
 * Strip control chars + whitespace and compare lowercased to the danger list.
 */
export function isUnsafeUrl(value: string): boolean {
  // Strip ASCII control chars + whitespace (code points 0x00-0x20 and DEL=0x7F)
  // before scheme detection. Browsers ignore those when resolving URLs, so an
  // attacker could otherwise hide a `javascript:` scheme behind them.
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\x00-\x20\x7f]/g, '').toLowerCase();
  // Block all data: URIs, not just data:text/html. data:image/svg+xml can
  // carry embedded scripts that execute in some browser contexts, and no
  // legitimate markdown link or image needs a data: source (user content is
  // stored as file objects, not inline data URIs).
  return (
    cleaned.startsWith('javascript:') ||
    cleaned.startsWith('vbscript:') ||
    cleaned.startsWith('data:')
  );
}

/**
 * Build the description-Markdown parser.
 *
 * Two instances exist because the same description HTML is rendered on two
 * very different surfaces: the stash viewer (full width, worth a copy button
 * on fenced code) and the dashboard cards (a two-line clamped teaser, where a
 * hover button would be noise — and where nothing wires up the delegated
 * click handler, so the button would be dead).
 */
function createDescriptionParser(codeCopyButtons: boolean): Marked {
  return new Marked({
    breaks: true,
    gfm: true,
    renderer: {
      link({ href, title, tokens }) {
        // Parse the label's inline tokens (bold, code, escaped HTML, …) — the
        // raw `text` field is the unrendered, unescaped source label.
        const label = this.parser.parseInline(tokens);
        // Strip dangerous schemes at render time as defence-in-depth alongside
        // the post-render sanitiser. Defaults to '#' so the anchor stays valid.
        const safeHref = isUnsafeUrl(href) ? '#' : href;
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        if (safeHref.startsWith('#')) {
          return `<a href="${escapeHtml(safeHref)}"${titleAttr}>${label}</a>`;
        }
        return `<a href="${escapeHtml(safeHref)}"${titleAttr} target="_blank" rel="noopener noreferrer">${label}</a>`;
      },
      // Mirrors marked's default fenced-code output (no syntax highlighting on
      // this surface), optionally wrapped in the copy-button scaffold.
      code({ text, lang }) {
        const language = (lang || '').trim().split(/\s+/)[0] || '';
        const source = text.replace(/\n$/, '');
        const classAttr = language ? ` class="language-${escapeHtml(language)}"` : '';
        const pre = `<pre><code${classAttr}>${escapeHtml(source)}\n</code></pre>`;
        return (codeCopyButtons ? wrapCodeBlockWithCopy(pre, source) : pre) + '\n';
      },
    },
  });
}

const descriptionParser = createDescriptionParser(false);
const descriptionParserWithCopy = createDescriptionParser(true);

/**
 * Strip dangerous elements + attributes from arbitrary HTML.
 *
 * Used by both this module (description-Markdown) and the file-Markdown
 * sanitiser in StashViewer. Exported so the two surfaces cannot drift
 * apart on the dangerous-attribute set — drift previously allowed `style`
 * to slip past file-Markdown while description-Markdown blocked it.
 */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc
    .querySelectorAll('script,style,iframe,object,embed,form,link,base,meta,noscript')
    .forEach((el) => el.remove());
  // Strip SVG/MathML foreign content + SMIL animation elements. Markdown never
  // legitimately emits these, and they are the vector for mutation-XSS and the
  // SMIL `<animate attributeName=href values="javascript:...">` bypass of the
  // href/on* checks below. Match on lowercased tagName so case-sensitive SVG
  // element names (animateTransform, foreignObject) are caught regardless of case.
  const FOREIGN_ELEMENTS = new Set([
    'svg',
    'math',
    'animate',
    'animatetransform',
    'animatemotion',
    'set',
    'foreignobject',
    'template',
  ]);
  doc.querySelectorAll('*').forEach((el) => {
    if (FOREIGN_ELEMENTS.has(el.tagName.toLowerCase())) {
      el.remove();
      return;
    }
    for (const attr of [...el.attributes]) {
      const lowerName = attr.name.toLowerCase();
      const isEventHandler = lowerName.startsWith('on');
      const isUrlAttr =
        lowerName === 'href' ||
        lowerName === 'src' ||
        lowerName === 'xlink:href' ||
        lowerName === 'action' ||
        lowerName === 'formaction';
      // Drop inline style entirely. Modern browsers no longer execute
      // `javascript:` inside CSS url(), but `style` is still a vector for UI
      // redress / data exfil via background-image, and historically for IE
      // `expression()`. Markdown descriptions never need inline styles, so
      // stripping is the safe default.
      const isStyleAttr = lowerName === 'style';
      if (isEventHandler || isStyleAttr || (isUrlAttr && isUnsafeUrl(attr.value))) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}

interface DescriptionMarkdownOptions {
  /**
   * Emit a copy button on fenced code blocks. Only enable it where a
   * `useCodeBlockCopy` handler is attached to the container — see
   * `createDescriptionParser`.
   */
  codeCopyButtons?: boolean;
}

export function renderDescriptionMarkdown(
  content: string,
  options: DescriptionMarkdownOptions = {},
): string {
  const parser = options.codeCopyButtons ? descriptionParserWithCopy : descriptionParser;
  const raw = parser.parse(content, { async: false }) as string;
  return sanitizeHtml(raw);
}
