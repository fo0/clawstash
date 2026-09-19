import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

/**
 * `/llms.txt` and its four siblings under `/api/` all embed `getBaseUrl(req)`
 * — the request's own `Host` header — in their body. A storable response on
 * any of them lets a shared cache hand the base URL one caller chose to every
 * agent that fetches the discovery document afterwards. The rule is only as
 * good as its path list, so pin the list.
 */
describe('middleware Cache-Control', () => {
  const noStorePaths = [
    '/llms.txt',
    '/api/agent-skill',
    '/api/mcp-onboarding',
    '/api/mcp-spec',
    '/api/openapi',
    '/mcp',
  ];

  for (const path of noStorePaths) {
    it(`marks ${path} non-storable`, () => {
      const res = middleware(new NextRequest(`http://localhost:3000${path}`));
      expect(res.headers.get('Cache-Control')).toBe('no-store');
    });
  }

  it('leaves page responses to Next.js own caching headers', () => {
    const res = middleware(new NextRequest('http://localhost:3000/'));
    expect(res.headers.get('Cache-Control')).toBeNull();
  });

  it('does not put CORS headers on /llms.txt', () => {
    const res = middleware(new NextRequest('http://localhost:3000/llms.txt'));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});
