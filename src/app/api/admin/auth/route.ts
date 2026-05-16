import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/server/singleton';
import { ADMIN_PASSWORD, ADMIN_SESSION_HOURS } from '@/server/auth';
import { parseJsonBody } from '@/app/api/_helpers';
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
  const password = ADMIN_PASSWORD();

  if (!password) {
    return NextResponse.json({
      token: '',
      expiresAt: null,
      message: 'No ADMIN_PASSWORD configured - open access mode',
    });
  }

  // Parse + validate the body BEFORE recording a rate-limit attempt.
  // Otherwise a client posting 10 malformed bodies (no `password` field,
  // unparseable JSON, etc.) burns the bucket and locks out legitimate
  // users for 15 minutes without ever guessing a password.
  const body = await parseJsonBody(req);
  if ('error' in body) return body.error;
  if (typeof body.data !== 'object' || body.data === null || Array.isArray(body.data)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const { password: inputPassword } = body.data as Record<string, unknown>;
  if (!inputPassword || typeof inputPassword !== 'string') {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  // Now we have a real password attempt — apply the per-IP throttle.
  const ip = getClientIp(req);
  const limit = checkAndRecordAuthAttempt('login', ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfter ?? RATE_LIMIT_WINDOW_SEC) },
      },
    );
  }

  const inputHash = crypto.createHash('sha256').update(inputPassword).digest();
  const storedHash = crypto.createHash('sha256').update(password).digest();
  if (!crypto.timingSafeEqual(inputHash, storedHash)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  // Successful login — clear the per-IP counter so a legitimate user who
  // mistyped their password a few times before getting it right is not
  // locked out for the remainder of the 15-min window.
  resetAuthAttempts('login', ip);

  const hours = ADMIN_SESSION_HOURS();
  const session = getDb().createAdminSession(hours);

  return NextResponse.json({
    token: session.token,
    expiresAt: session.expiresAt,
  });
}
