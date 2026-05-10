import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, getAccessSource, getRequestInfo, parsePositiveInt } from '@/app/api/_helpers';

type Params = { params: Promise<{ id: string; version: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { id, version: versionStr } = await params;
  const version = parsePositiveInt(versionStr);
  if (version === undefined) {
    return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
  }

  const db = getDb();
  if (!db.stashExists(id)) {
    return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
  }
  const versionData = db.getStashVersion(id, version);
  if (!versionData) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }
  const { ip, userAgent } = getRequestInfo(req);
  db.logAccess(id, getAccessSource(req), `read_version:${version}`, ip, userAgent);
  return NextResponse.json(versionData);
}
