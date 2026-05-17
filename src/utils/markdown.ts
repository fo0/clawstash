import { Marked } from 'marked';
import { escapeHtml } from './html';

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
  let cleaned = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code > 0x20 && code !== 0x7f) cleaned += value[i];
  }
  cleaned = cleaned.toLowerCase();
  return (
    cleaned.startsWith('javascript:') ||
    cleaned.startsWith('vbscript:') ||
    cleaned.startsWith('data:text/html')
  );
}

const descriptionParser = new Marked({
  breaks: true,
  gfm: true,
  renderer: {
    link({ href, title, text }) {
      // Strip dangerous schemes at render time as defence-in-depth alongside
      // the post-render sanitiser. Defaults to '#' so the anchor stays valid.
      const safeHref = isUnsafeUrl(href) ? '#' : href;
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      if (safeHref.startsWith('#')) {
        return `<a href="${escapeHtml(safeHref)}"${titleAttr}>${text}</a>`;
      }
      return `<a href="${escapeHtml(safeHref)}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc
    .querySelectorAll('script,style,iframe,object,embed,form,link,base,meta,noscript')
    .forEach((el) => el.remove());
  doc.querySelectorAll('*').forEach((el) => {
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

export function renderDescriptionMarkdown(content: string): string {
  const raw = descriptionParser.parse(content, { async: false }) as string;
  return sanitizeHtml(raw);
}
