import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/server/singleton';
import { ADMIN_PASSWORD, ADMIN_SESSION_HOURS } from '@/server/auth';
import { parseJsonBody } from '@/app/api/_helpers';
import {
  checkAndRecordAuthAttempt,
  resetAuthAttempts,
  getClientIp,
} from '@/server/auth-rate-limit';

export async function POST(req: NextRequest) {
  const password = ADMIN_PASSWORD();

  if (!password) {
    return NextResponse.json({
      token: '',
      expiresAt: null,
      message: 'No ADMIN_PASSWORD configured - open access mode',
    });
  }

  // Per-IP brute-force throttle (10 attempts / 15 min).
  const ip = getClientIp(req);
  const limit = checkAndRecordAuthAttempt('login', ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfter ?? 60) },
      },
    );
  }

  const body = await parseJsonBody(req);
  if ('error' in body) return body.error;
  const { password: inputPassword } = body.data as Record<string, unknown>;
  if (!inputPassword || typeof inputPassword !== 'string') {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
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
