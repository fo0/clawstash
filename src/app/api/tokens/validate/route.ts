import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { extractToken } from '@/server/auth';

export async function POST(req: NextRequest) {
  // Use the shared extractor so callers can pass either Authorization: Bearer
  // or ?token=… (matching the convention used by every other route).
  const token = extractToken(req);
  if (!token) {
    return NextResponse.json({ valid: false, scopes: [] });
  }
  const result = getDb().validateApiToken(token);
  return NextResponse.json({ valid: result.valid, scopes: result.scopes });
}
