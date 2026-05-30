import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { extractToken, validateAuth } from '@/server/auth';
import {
  checkAndRecordAuthAttempt,
  getClientIp,
  RATE_LIMIT_WINDOW_SEC,
} from '@/server/auth-rate-limit';

// Rate-limit state lives in an in-memory Map on the Node runtime; pin this
// handler so it shares state with the other admin auth routes.
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: 'No token provided' }, { status: 401 });
  }

  // Logout hashes a candidate token and queries the DB on every call. It's
  // cheap and only deletes on success, but it's still unbounded — apply the
  // same per-IP throttle so a flood of POSTs cannot pin a sqlite connection.
  // Recorded AFTER token extraction so a malformed request (no Authorization
  // header) cannot burn the bucket.
  const ip = getClientIp(req);
  const limit = checkAndRecordAuthAttempt('logout', ip);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many logout attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfter ?? RATE_LIMIT_WINDOW_SEC) },
      },
    );
  }

  // Validate the token belongs to a real admin session before deleting it.
  // Without this check, any caller could enumerate / invalidate admin sessions
  // by guessing or replaying captured admin tokens — even if they are not
  // themselves authenticated. (API tokens reaching this path are also rejected,
  // so accidentally hitting /api/admin/logout with a `cs_…` token does nothing.)
  const db = getDb();
  const auth = validateAuth(db, token);
  if (!auth.authenticated || auth.source !== 'admin_session') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  db.deleteAdminSession(token);
  // Standard admin POST response shape: { success: true, message }. `message`
  // is preserved for backwards compatibility with existing callers that read it.
  return NextResponse.json({ success: true, message: 'Logged out' });
}
