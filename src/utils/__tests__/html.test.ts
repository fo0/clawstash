import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../html';

describe('escapeHtml', () => {
  it('escapes the four HTML-significant chars', () => {
    expect(escapeHtml('a&b<c>d"e')).toBe('a&amp;b&lt;c&gt;d&quot;e');
  });

  it('escapes ampersand first so other entity prefixes are double-escaped', () => {
    // Guards against a regression where `&` is replaced after `<`/`>`/`"`,
    // which would leave the `&` in `&amp;`/`&lt;`/etc. literal in the input.
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
  });

  it('returns input unchanged when no significant chars are present', () => {
    expect(escapeHtml('hello world 123')).toBe('hello world 123');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes nested patterns without double-escaping', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    );
  });
});
