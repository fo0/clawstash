import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { requireScopeAuth, requireAdminAuth, extractToken } from '@/server/auth';
import type { TokenScope } from '@/server/db';

export function checkScope(req: NextRequest, scope: TokenScope) {
  const db = getDb();
  const auth = requireScopeAuth(db, req, scope);
  if (auth) return { ok: true as const };
  const token = extractToken(req);
  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Authentication required. Provide a Bearer token.' },
        { status: 401 },
      ),
    };
  }
  return {
    ok: false as const,
    response: NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 }),
  };
}

export function checkAdmin(req: NextRequest) {
  const db = getDb();
  const auth = requireAdminAuth(db, req);
  if (auth) return { ok: true as const };
  // Mirror checkScope(): use extractToken() so non-Bearer Authorization
  // schemes (e.g. Basic) are treated as "no Bearer token present" and
  // surface 401 (Authentication required) rather than 403.
  const token = extractToken(req);
  if (!token) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Authentication required. Provide a Bearer token.' },
        { status: 401 },
      ),
    };
  }
  return {
    ok: false as const,
    response: NextResponse.json({ error: 'Admin access required.' }, { status: 403 }),
  };
}

export function getAccessSource(req: NextRequest): 'ui' | 'api' {
  return req.headers.get('x-access-source') === 'ui' ? 'ui' : 'api';
}

export function getBaseUrl(req: NextRequest): string {
  // `x-forwarded-{proto,host}` are attacker-controlled without a trusted
  // proxy boundary. Spoofed values flow into OpenAPI / MCP spec output (the
  // schema's `servers[].url` and example URLs) and are echoed back to clients
  // — useful for an attacker who wants to seed onboarding/spec text with a
  // phishing host. Mirror `auth-rate-limit.ts:getClientIp`: only honour the
  // forwarded headers when `TRUST_PROXY=1` (or =true) is explicitly set.
  const trustProxy = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';
  const proto = (trustProxy && req.headers.get('x-forwarded-proto')) || 'http';
  const host =
    (trustProxy && req.headers.get('x-forwarded-host')) ||
    req.headers.get('host') ||
    'localhost:3000';
  return `${proto}://${host}`;
}

/**
 * Parse a positive integer from a query parameter string.
 * Returns undefined for null, empty, NaN, negative, or non-integer values.
 */
export function parsePositiveInt(value: string | null): number | undefined {
  if (!value) return undefined;
  const num = parseInt(value, 10);
  return Number.isInteger(num) && num > 0 ? num : undefined;
}

/**
 * Parse and return the JSON body from a request, or an error response.
 */
export async function parseJsonBody(
  req: NextRequest,
): Promise<{ data: unknown } | { error: NextResponse }> {
  try {
    return { data: await req.json() };
  } catch {
    return { error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) };
  }
}

/**
 * Extract IP and user agent from request headers for access logging.
 * x-forwarded-for may contain a comma-separated chain; only the first
 * entry (the original client) is recorded to match middleware behavior
 * and avoid leaking spoofed downstream values into logs. Falls back to
 * x-real-ip when XFF is absent (nginx, traefik) so proxies that only
 * forward one or the other still produce useful logs.
 */
export function getRequestInfo(req: NextRequest): {
  ip: string | undefined;
  userAgent: string | undefined;
} {
  const xff = req.headers.get('x-forwarded-for');
  const ip =
    (xff ? xff.split(',')[0].trim() : '') || req.headers.get('x-real-ip')?.trim() || undefined;
  return {
    ip,
    userAgent: req.headers.get('user-agent') || undefined,
  };
}
