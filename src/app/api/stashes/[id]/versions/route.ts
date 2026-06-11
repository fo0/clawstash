import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import {
  checkScope,
  getAccessSource,
  getRequestInfo,
  parsePositiveInt,
  parseNonNegativeInt,
} from '@/app/api/_helpers';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { id } = await params;
  const db = getDb();
  if (!db.stashExists(id)) {
    return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
  }
  // Optional pagination for large version histories (BACKLOG #8). `limit`
  // must be >= 1; `offset` accepts 0 (first page). Absent/invalid -> full list.
  const limit = parsePositiveInt(req.nextUrl.searchParams.get('limit'));
  const offset = parseNonNegativeInt(req.nextUrl.searchParams.get('offset'));
  const versions = db.getStashVersions(id, { limit, offset });
  const { ip, userAgent } = getRequestInfo(req);
  db.logAccess(id, getAccessSource(req), 'read_versions', ip, userAgent);
  return NextResponse.json(versions);
}
