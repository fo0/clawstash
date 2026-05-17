import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, parsePositiveInt, getAccessSource, getRequestInfo } from '@/app/api/_helpers';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { id } = await params;
  const db = getDb();
  if (!db.stashExists(id)) {
    return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
  }

  const v1 = parsePositiveInt(req.nextUrl.searchParams.get('v1'));
  const v2 = parsePositiveInt(req.nextUrl.searchParams.get('v2'));
  if (!v1 || !v2 || v1 === v2) {
    return NextResponse.json(
      { error: 'Provide two different positive version numbers as v1 and v2 query parameters' },
      { status: 400 },
    );
  }

  // getStashVersion supports both historical versions and the current live version
  const version1 = db.getStashVersion(id, v1);
  const version2 = db.getStashVersion(id, v2);
  if (!version1 || !version2) {
    return NextResponse.json({ error: 'One or both versions not found' }, { status: 404 });
  }
  const { ip, userAgent } = getRequestInfo(req);
  db.logAccess(id, getAccessSource(req), `read_version_diff:${v1}..${v2}`, ip, userAgent);
  return NextResponse.json({ v1: version1, v2: version2 });
}
