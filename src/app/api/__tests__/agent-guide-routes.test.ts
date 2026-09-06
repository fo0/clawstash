import { describe, it, expect } from 'vitest';
import type { NextRequest } from 'next/server';
import { GET as getAgentSkill } from '@/app/api/agent-skill/route';
import { GET as getLlmsTxtRoute } from '@/app/llms.txt/route';
import { getAgentSkillText, getLlmsTxt } from '@/server/agent-guide';

/**
 * The two unauthenticated guide routes. What matters here is the framing the
 * generators cannot test themselves: the content type an agent's fetch sees,
 * and that the instance URL inside the text comes from the request (via
 * `getBaseUrl`), not from a hard-coded host.
 */

// Minimal request stub — `getBaseUrl` only reads `req.headers.get(name)`.
function fakeRequest(host: string): NextRequest {
  return {
    headers: {
      get: (name: string): string | null => (name.toLowerCase() === 'host' ? host : null),
    },
  } as unknown as NextRequest;
}

describe('GET /api/agent-skill', () => {
  it('serves the SKILL.md for the requesting host as text/markdown', async () => {
    const res = await getAgentSkill(fakeRequest('stash.example.com:8443'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
    const body = await res.text();
    expect(body).toBe(getAgentSkillText('http://stash.example.com:8443'));
    expect(body).toContain('http://stash.example.com:8443/mcp');
    expect(body.startsWith('---\nname: clawstash\n')).toBe(true);
  });
});

describe('GET /llms.txt', () => {
  it('serves the discovery index for the requesting host as text/plain', async () => {
    const res = await getLlmsTxtRoute(fakeRequest('stash.example.com'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    const body = await res.text();
    expect(body).toBe(getLlmsTxt('http://stash.example.com'));
    expect(body).toContain('http://stash.example.com/api/agent-skill');
  });
});
