import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getDb } from '@/server/singleton';
import { ADMIN_PASSWORD, ADMIN_SESSION_HOURS } from '@/server/auth';

export async function POST(req: NextRequest) {
  const password = ADMIN_PASSWORD();

  if (!password) {
    return NextResponse.json({
      token: '',
      expiresAt: null,
      message: 'No ADMIN_PASSWORD configured - open access mode',
    });
  }

  const body = await req.json();
  const { password: inputPassword } = body;
  if (!inputPassword || typeof inputPassword !== 'string') {
    return NextResponse.json({ error: 'Password is required' }, { status: 400 });
  }

  const inputHash = crypto.createHash('sha256').update(inputPassword).digest();
  const storedHash = crypto.createHash('sha256').update(password).digest();
  if (!crypto.timingSafeEqual(inputHash, storedHash)) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const hours = ADMIN_SESSION_HOURS();
  const session = getDb().createAdminSession(hours);

  return NextResponse.json({
    token: session.token,
    expiresAt: session.expiresAt,
  });
}
