import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { getBaseUrl } from '../_helpers';

/**
 * Regression test for BACKLOG #120: `x-forwarded-{proto,host}` are comma lists
 * under multi-hop proxy chains. `getBaseUrl` must take only the first
 * (client-most) entry and only when `TRUST_PROXY` is enabled — mirroring
 * `extractClientIp()` / middleware's `isHttpsRequest()`.
 */

// Minimal request stub — `getBaseUrl` only reads `req.headers.get(name)`.
function fakeRequest(headers: Record<string, string | undefined>): NextRequest {
  const lower: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    headers: {
      get: (name: string): string | null => lower[name.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

describe('getBaseUrl', () => {
  const original = process.env.TRUST_PROXY;

  beforeEach(() => {
    delete process.env.TRUST_PROXY;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = original;
  });

  it('ignores forwarded headers without TRUST_PROXY and falls back to host', () => {
    const req = fakeRequest({
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'evil.example',
      host: 'real.example',
    });
    expect(getBaseUrl(req)).toBe('http://real.example');
  });

  it('honours forwarded headers when TRUST_PROXY is set', () => {
    process.env.TRUST_PROXY = '1';
    const req = fakeRequest({
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'app.example',
      host: 'real.example',
    });
    expect(getBaseUrl(req)).toBe('https://app.example');
  });

  it('takes only the first entry of a multi-hop forwarded chain', () => {
    process.env.TRUST_PROXY = 'true';
    const req = fakeRequest({
      'x-forwarded-proto': 'https, http',
      'x-forwarded-host': 'app.example, internal-proxy.example',
      host: 'real.example',
    });
    // Without the comma-split the proto would become "https, http" and the host
    // "app.example, internal-proxy.example" — a malformed servers[].url.
    expect(getBaseUrl(req)).toBe('https://app.example');
  });

  it('trims whitespace around the first forwarded entry', () => {
    process.env.TRUST_PROXY = '1';
    const req = fakeRequest({
      'x-forwarded-proto': ' https ',
      'x-forwarded-host': ' app.example , next ',
      host: 'real.example',
    });
    expect(getBaseUrl(req)).toBe('https://app.example');
  });

  it('defaults to localhost when no host header is present', () => {
    const req = fakeRequest({});
    expect(getBaseUrl(req)).toBe('http://localhost:3000');
  });
});
