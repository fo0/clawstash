// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from '../svg-sanitize';

describe('sanitizeSvg', () => {
  it('removes script elements', () => {
    const out = sanitizeSvg('<svg><script>alert(1)</script><rect width="4" /></svg>');
    expect(out).not.toContain('script');
    expect(out).toContain('<rect');
  });

  it('removes inline event handlers regardless of case', () => {
    const out = sanitizeSvg('<svg><rect onclick="x()" ONMOUSEOVER="y()" fill="red" /></svg>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('onmouseover');
    expect(out).toContain('fill="red"');
  });

  it('drops javascript: URLs but keeps ordinary links', () => {
    const unsafe = sanitizeSvg('<svg><a href="javascript:alert(1)"><rect /></a></svg>');
    expect(unsafe).not.toContain('javascript:');
    const safe = sanitizeSvg('<svg><a href="https://example.com"><rect /></a></svg>');
    expect(safe).toContain('https://example.com');
  });

  it('drops javascript: in xlink:href and data:text/html', () => {
    expect(sanitizeSvg('<svg><use xlink:href="javascript:alert(1)" /></svg>')).not.toContain(
      'javascript:',
    );
    expect(sanitizeSvg('<svg><a href="data:text/html,<b>x">t</a></svg>')).not.toContain(
      'data:text/html',
    );
  });

  it('drops data:image/svg+xml, which carries its own script context', () => {
    // An SVG document referenced through a data: URI brings markup this
    // sanitiser never inspects, so it must be rejected by scheme. Mirrors
    // isUnsafeUrl() in utils/markdown.ts, which rejects it on the Markdown
    // surface — the two normalisations are deliberately kept in step.
    expect(
      sanitizeSvg('<svg><use xlink:href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" /></svg>'),
    ).not.toContain('data:image/svg+xml');
    expect(sanitizeSvg('<svg><a href="DATA:IMAGE/SVG+XML,<svg/>">t</a></svg>')).not.toContain(
      'IMAGE/SVG+XML',
    );
  });

  it('keeps raster data: URIs, which cannot carry script', () => {
    // Only the SVG/HTML data: forms are script-bearing. Blocking every data:
    // URI would strip a legitimate inline icon out of a diagram.
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect(sanitizeSvg(`<svg><image href="${png}" /></svg>`)).toContain(png);
  });

  it('drops script schemes obfuscated with control chars or whitespace', () => {
    // The HTML parser decodes the entity into a literal TAB inside the
    // scheme; browsers ignore it when resolving the URL, so the sanitiser
    // must too. Leading whitespace alone was already handled.
    expect(sanitizeSvg('<svg><a href="jav&#9;ascript:alert(1)"><rect /></a></svg>')).not.toContain(
      'alert(1)',
    );
    expect(sanitizeSvg('<svg><a href="  JaVaScRiPt:alert(1)"><rect /></a></svg>')).not.toContain(
      'alert(1)',
    );
    expect(sanitizeSvg('<svg><use xlink:href="java\nscript:alert(1)" /></svg>')).not.toContain(
      'alert(1)',
    );
  });

  it('removes embedded document elements', () => {
    const out = sanitizeSvg('<svg><foreignObject><iframe src="/x"></iframe></foreignObject></svg>');
    expect(out).not.toContain('iframe');
    expect(out.toLowerCase()).toContain('foreignobject');
  });

  it('removes SMIL animation elements that could rewrite attributes post-sanitise', () => {
    const out = sanitizeSvg(
      '<svg><a href="#ok"><animate attributeName="href" values="javascript:alert(1)" /><rect /></a></svg>',
    );
    expect(out.toLowerCase()).not.toContain('<animate');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('<rect');
    // camelCase spellings and <set> are covered too.
    expect(
      sanitizeSvg('<svg><animateTransform /><animateMotion /><set attributeName="onload" /></svg>'),
    ).not.toMatch(/animatetransform|animatemotion|<set/i);
  });

  it('keeps benign diagram markup intact', () => {
    const svg =
      '<svg viewBox="0 0 10 10"><style>.n{fill:#fff}</style><marker markerWidth="6" /><g class="n"><text>label</text></g></svg>';
    const out = sanitizeSvg(svg);
    expect(out).toContain('viewBox="0 0 10 10"');
    expect(out).toContain('markerWidth="6"');
    expect(out).toContain('<style>.n{fill:#fff}</style>');
    expect(out).toContain('label');
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeSvg('')).toBe('');
  });
});
