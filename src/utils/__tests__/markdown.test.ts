// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitizeHtml, isUnsafeUrl, renderDescriptionMarkdown } from '../markdown';

// `sanitizeHtml` is the sole XSS gate for stored markdown (stash descriptions
// and `.md` files) — `marked` passes raw inline/block HTML through untouched.
// It is a denylist, so every rule it relies on needs a regression test: a
// silent drop of one branch re-opens a stored-XSS path with no other signal.
// Flagged in security sweep #372 as "no unit tests for sanitizeHtml".

/** Lowercased tag names still present in the sanitized output. */
function tagsIn(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.body.querySelectorAll('*')].map((el) => el.tagName.toLowerCase());
}

describe('isUnsafeUrl', () => {
  it('flags script-bearing schemes', () => {
    expect(isUnsafeUrl('javascript:alert(1)')).toBe(true);
    expect(isUnsafeUrl('vbscript:msgbox(1)')).toBe(true);
    expect(isUnsafeUrl('data:text/html,<script>alert(1)</script>')).toBe(true);
  });

  it('flags all data: URIs, not just text/html', () => {
    // data:image/svg+xml can carry script in some browser contexts.
    expect(isUnsafeUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(true);
    expect(isUnsafeUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
  });

  it('sees through case variation', () => {
    expect(isUnsafeUrl('JaVaScRiPt:alert(1)')).toBe(true);
    expect(isUnsafeUrl('JAVASCRIPT:alert(1)')).toBe(true);
  });

  it('sees through leading whitespace and control chars', () => {
    expect(isUnsafeUrl('  javascript:alert(1)')).toBe(true);
    expect(isUnsafeUrl('\tjava\nscript:alert(1)')).toBe(true);
    expect(isUnsafeUrl('\x00javascript:alert(1)')).toBe(true);
    expect(isUnsafeUrl('java\x0bscript:alert(1)')).toBe(true);
  });

  it('leaves ordinary URLs alone', () => {
    expect(isUnsafeUrl('https://example.com')).toBe(false);
    expect(isUnsafeUrl('/relative/path')).toBe(false);
    expect(isUnsafeUrl('#anchor')).toBe(false);
    expect(isUnsafeUrl('mailto:a@example.com')).toBe(false);
  });
});

describe('sanitizeHtml — dangerous elements', () => {
  it('removes script and its content', () => {
    const out = sanitizeHtml('<p>before</p><script>alert(1)</script><p>after</p>');
    expect(tagsIn(out)).toEqual(['p', 'p']);
    expect(out).not.toContain('alert(1)');
  });

  it.each(['style', 'iframe', 'object', 'embed', 'form', 'link', 'base', 'meta', 'noscript'])(
    'removes <%s>',
    (tag) => {
      expect(tagsIn(sanitizeHtml(`<p>x</p><${tag}></${tag}>`))).toEqual(['p']);
    },
  );

  it.each([
    'svg',
    'math',
    'animate',
    'animateTransform',
    'animateMotion',
    'set',
    'foreignObject',
    'template',
  ])('removes foreign/SMIL element <%s> regardless of case', (tag) => {
    expect(tagsIn(sanitizeHtml(`<p>x</p><${tag}></${tag}>`))).toEqual(['p']);
    expect(tagsIn(sanitizeHtml(`<p>x</p><${tag.toUpperCase()}></${tag.toUpperCase()}>`))).toEqual([
      'p',
    ]);
  });

  it('removes the SMIL href-animation bypass wholesale', () => {
    // <animate attributeName=href values="javascript:..."> mutates an anchor's
    // href after the attribute check would have passed.
    const out = sanitizeHtml(
      '<a href="#x"><animate attributeName="href" values="javascript:alert(1)"/></a>',
    );
    expect(tagsIn(out)).toEqual(['a']);
    expect(out).not.toContain('javascript:');
  });

  it('removes nested dangerous elements inside allowed containers', () => {
    const out = sanitizeHtml('<div><blockquote><script>alert(1)</script></blockquote></div>');
    expect(out).not.toContain('script');
  });
});

describe('sanitizeHtml — dangerous attributes', () => {
  it('strips event handlers in any casing', () => {
    const out = sanitizeHtml('<p onclick="a()" ONERROR="b()" oNmOuSeOvEr="c()">x</p>');
    expect(out).toContain('<p>');
    expect(out.toLowerCase()).not.toContain('onclick');
    expect(out.toLowerCase()).not.toContain('onerror');
    expect(out.toLowerCase()).not.toContain('onmouseover');
  });

  it('strips inline style', () => {
    const out = sanitizeHtml('<p style="background-image:url(https://evil.example/x)">x</p>');
    expect(out).not.toContain('style');
  });

  it.each(['href', 'src', 'xlink:href', 'action', 'formaction'])(
    'strips unsafe scheme from %s',
    (attr) => {
      const out = sanitizeHtml(`<a ${attr}="javascript:alert(1)">x</a>`);
      expect(out).not.toContain('javascript:');
    },
  );

  it('keeps the element when only the URL attribute is unsafe', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">label</a>');
    expect(tagsIn(out)).toEqual(['a']);
    expect(out).toContain('label');
  });

  it('preserves safe URL attributes', () => {
    const out = sanitizeHtml('<a href="https://example.com" title="t">x</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('title="t"');
  });

  it('strips obfuscated javascript: URLs', () => {
    expect(sanitizeHtml('<a href="JaVaScRiPt:alert(1)">x</a>')).not.toContain('alert');
    expect(sanitizeHtml('<a href=" \tjavascript:alert(1)">x</a>')).not.toContain('alert');
  });
});

describe('sanitizeHtml — legitimate markup survives', () => {
  it('keeps headings, lists, code, tables and links', () => {
    const html =
      '<h2 id="a">Title</h2><ul><li>item</li></ul>' +
      '<pre><code class="language-ts">const a = 1;</code></pre>' +
      '<table><tbody><tr><td>cell</td></tr></tbody></table>' +
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>';
    const out = sanitizeHtml(html);
    expect(tagsIn(out)).toEqual([
      'h2',
      'ul',
      'li',
      'pre',
      'code',
      'table',
      'tbody',
      'tr',
      'td',
      'a',
    ]);
    expect(out).toContain('class="language-ts"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('keeps the mermaid placeholder div and its data attribute', () => {
    // StashViewer's code renderer emits these; hydration depends on both the
    // class and the encoded source surviving sanitisation (see #286).
    const out = sanitizeHtml('<div class="mermaid-placeholder" data-mermaid-source="eA=="></div>');
    expect(out).toContain('class="mermaid-placeholder"');
    expect(out).toContain('data-mermaid-source="eA=="');
  });

  it('handles empty input', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('renderDescriptionMarkdown', () => {
  it('renders ordinary markdown', () => {
    expect(renderDescriptionMarkdown('**bold**')).toContain('<strong>bold</strong>');
  });

  it('sanitises raw HTML embedded in markdown', () => {
    const out = renderDescriptionMarkdown('text\n\n<img src=x onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain('onerror');
  });

  it('neutralises javascript: links written as markdown', () => {
    const out = renderDescriptionMarkdown('[click](javascript:alert(1))');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('href="#"');
  });

  it('adds rel=noopener to external links', () => {
    const out = renderDescriptionMarkdown('[x](https://example.com)');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('escapes attribute-breaking characters in link titles', () => {
    const out = renderDescriptionMarkdown('[x](https://example.com "a\\"onmouseover=\\"b")');
    expect(out.toLowerCase()).not.toContain('" onmouseover');
  });
});
