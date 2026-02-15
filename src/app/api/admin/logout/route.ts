import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { extractToken } from '@/server/auth';

export async function POST(req: NextRequest) {
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ error: 'No token provided' }, { status: 401 });
  }
  getDb().deleteAdminSession(token);
  return NextResponse.json({ message: 'Logged out' });
}
