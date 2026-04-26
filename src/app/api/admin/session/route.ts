import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { extractToken, validateAuth, isAuthEnabled } from '@/server/auth';
import {
  checkAndRecordAuthAttempt,
  resetAuthAttempts,
  getClientIp,
  RATE_LIMIT_WINDOW_SEC,
} from '@/server/auth-rate-limit';

// Rate-limit state lives in an in-memory Map; this route MUST run on the
// Node runtime so the route handler can share state with itself across
// requests (Edge runtime has per-request isolation).
export const runtime = 'nodejs';

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

  // When a token IS supplied, this endpoint validates it — which makes it
  // a brute-force oracle indistinguishable from /api/tokens/validate.
  // Apply the same per-IP throttle (same `token-validate` scope) so the
  // attack cost is uniform across all token-validating endpoints.
  const ip = getClientIp(req);
  const limit = checkAndRecordAuthAttempt('token-validate', ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { authenticated: false, authRequired: true, error: 'Too many token-validation attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfter ?? RATE_LIMIT_WINDOW_SEC) },
      },
    );
  }

  const auth = validateAuth(getDb(), token);
  if (!auth.authenticated) {
    return NextResponse.json({ authenticated: false, authRequired: true });
  }

  // Successful validation — clear the counter so the UI's status polling
  // (mounted on every page load) doesn't accumulate against legitimate users.
  resetAuthAttempts('token-validate', ip);

  return NextResponse.json({
    authenticated: true,
    authRequired: true,
    source: auth.source,
    scopes: auth.scopes,
    expiresAt: auth.expiresAt ?? null,
  });
}
