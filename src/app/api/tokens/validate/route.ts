import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    return NextResponse.json({ valid: false, scopes: [] });
  }
  const token = auth.substring(7);
  const result = getDb().validateApiToken(token);
  return NextResponse.json({ valid: result.valid, scopes: result.scopes });
}
