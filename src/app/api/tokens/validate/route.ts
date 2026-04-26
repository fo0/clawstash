import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { extractToken } from '@/server/auth';
import {
  checkAndRecordAuthAttempt,
  resetAuthAttempts,
  getClientIp,
} from '@/server/auth-rate-limit';

export async function POST(req: NextRequest) {
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
        headers: { 'Retry-After': String(limit.retryAfter ?? 60) },
      },
    );
  }

  // Use the shared extractor so callers can pass either Authorization: Bearer
  // or ?token=… (matching the convention used by every other route).
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ valid: false, scopes: [] });
  }
  const result = getDb().validateApiToken(token);
  if (result.valid) {
    // Successful validation — clear the counter so applications that
    // legitimately validate often (UI status checks) are not penalised.
    resetAuthAttempts('token-validate', ip);
  }
  return NextResponse.json({ valid: result.valid, scopes: result.scopes });
}
