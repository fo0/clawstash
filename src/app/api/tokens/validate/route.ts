import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { extractToken } from '@/server/auth';
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

export async function POST(req: NextRequest) {
  // Use the shared extractor so callers can pass either Authorization: Bearer
  // or ?token=… (matching the convention used by every other route).
  // Extract the token BEFORE recording an attempt: empty / missing tokens
  // are not real validation attempts and shouldn't burn the per-IP bucket
  // (otherwise UI-status probes from the same NAT IP could lock out the
  // /api/tokens/validate endpoint for 15 minutes).
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ valid: false, scopes: [] });
  }

  // Per-IP throttle so this endpoint cannot be used as a fast brute-force
  // oracle for guessing API tokens (separate scope from the login limiter
  // so legitimate admin login isn't penalised by token-validate noise).
  const ip = getClientIp(req);
  const limit = checkAndRecordAuthAttempt('token-validate', ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { valid: false, scopes: [], error: 'Too many token-validation attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfter ?? RATE_LIMIT_WINDOW_SEC) },
      },
    );
  }

  const result = getDb().validateApiToken(token);
  if (result.valid) {
    // Successful validation — clear the counter so applications that
    // legitimately validate often (UI status checks) are not penalised.
    resetAuthAttempts('token-validate', ip);
  }
  return NextResponse.json({ valid: result.valid, scopes: result.scopes });
}
