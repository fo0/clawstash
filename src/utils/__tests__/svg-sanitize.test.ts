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

  it('removes embedded document elements', () => {
    const out = sanitizeSvg('<svg><foreignObject><iframe src="/x"></iframe></foreignObject></svg>');
    expect(out).not.toContain('iframe');
    expect(out.toLowerCase()).toContain('foreignobject');
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
