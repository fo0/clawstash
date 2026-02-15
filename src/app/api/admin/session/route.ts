import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { extractToken, validateAuth, isAuthEnabled } from '@/server/auth';

export async function GET(req: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({
      authenticated: true,
      authRequired: false,
      source: 'open',
      scopes: ['read', 'write', 'admin', 'mcp'],
    });
  }

  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ authenticated: false, authRequired: true });
  }

  const auth = validateAuth(getDb(), token);
  if (!auth.authenticated) {
    return NextResponse.json({ authenticated: false, authRequired: true });
  }

  return NextResponse.json({
    authenticated: true,
    authRequired: true,
    source: auth.source,
    scopes: auth.scopes,
    expiresAt: auth.expiresAt ?? null,
  });
}
