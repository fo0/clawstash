import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, parsePositiveInt } from '@/app/api/_helpers';

// GET /api/backup/log[?stashId=&limit=] — recent sync history (read scope).
// Error messages stored in the log are redacted at write time, so nothing
// here can leak the token.
export async function GET(req: NextRequest) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const params = req.nextUrl.searchParams;
  const stashId = params.get('stashId') || undefined;
  const limit = Math.min(parsePositiveInt(params.get('limit')) ?? 50, 200);

  const entries = getDb().getBackupLog({ stashId, limit });
  return NextResponse.json({ entries });
}
