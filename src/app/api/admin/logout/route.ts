import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { extractToken, validateAuth } from '@/server/auth';

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: 'No token provided' }, { status: 401 });
  }
  // Validate the token belongs to a real admin session before deleting it.
  // Without this check, any caller could enumerate / invalidate admin sessions
  // by guessing or replaying captured admin tokens — even if they are not
  // themselves authenticated. (API tokens reaching this path are also rejected,
  // so accidentally hitting /api/admin/logout with a `cs_…` token does nothing.)
  const auth = validateAuth(getDb(), token);
  if (!auth.authenticated || auth.source !== 'admin_session') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  getDb().deleteAdminSession(token);
  return NextResponse.json({ message: 'Logged out' });
}
