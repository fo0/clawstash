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
    return { ok: false as const, response: NextResponse.json({ error: 'Authentication required. Provide a Bearer token.' }, { status: 401 }) };
  }
  return { ok: false as const, response: NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 }) };
}

export function checkAdmin(req: NextRequest) {
  const db = getDb();
  const auth = requireAdminAuth(db, req);
  if (auth) return { ok: true as const };
  const hasToken = !!req.headers.get('authorization') || !!req.nextUrl.searchParams.get('token');
  if (!hasToken) {
    return { ok: false as const, response: NextResponse.json({ error: 'Authorization required' }, { status: 401 }) };
  }
  return { ok: false as const, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) };
}

export function getAccessSource(req: NextRequest): 'ui' | 'api' {
  return req.headers.get('x-access-source') === 'ui' ? 'ui' : 'api';
}

export function getBaseUrl(req: NextRequest): string {
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
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
export async function parseJsonBody(req: NextRequest): Promise<{ data: unknown } | { error: NextResponse }> {
  try {
    return { data: await req.json() };
  } catch {
    return { error: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) };
  }
}

/**
 * Extract IP and user agent from request headers for access logging.
 */
export function getRequestInfo(req: NextRequest): { ip: string | undefined; userAgent: string | undefined } {
  return {
    ip: req.headers.get('x-forwarded-for') || undefined,
    userAgent: req.headers.get('user-agent') || undefined,
  };
}
