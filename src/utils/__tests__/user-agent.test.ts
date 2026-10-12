import { describe, expect, it } from 'vitest';
import { MAX_CLIENT_LABEL, userAgentLabel } from '../user-agent';

describe('userAgentLabel', () => {
  it('returns null without a header', () => {
    expect(userAgentLabel(undefined)).toBeNull();
    expect(userAgentLabel(null)).toBeNull();
    expect(userAgentLabel('   ')).toBeNull();
  });

  it('names common browsers with their major version', () => {
    expect(
      userAgentLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
      ),
    ).toBe('Firefox 131');
    expect(
      userAgentLabel(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome 129');
    expect(
      userAgentLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.2792.79',
      ),
    ).toBe('Edge 129');
    expect(
      userAgentLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      ),
    ).toBe('Safari 18');
  });

  it('falls back to "Browser" for an unknown Mozilla-style string', () => {
    expect(userAgentLabel('Mozilla/5.0 (compatible; SomeBot)')).toBe('Browser');
  });

  it('keeps the first product token of a non-browser client', () => {
    expect(userAgentLabel('curl/8.5.0')).toBe('curl/8.5.0');
    expect(userAgentLabel('python-requests/2.32.3 extra/1')).toBe('python-requests/2.32.3');
    expect(userAgentLabel('node')).toBe('node');
  });

  it('caps a long token with an ellipsis', () => {
    const label = userAgentLabel('x'.repeat(100));
    expect(label).toHaveLength(MAX_CLIENT_LABEL);
    expect(label?.endsWith('…')).toBe(true);
  });
});
