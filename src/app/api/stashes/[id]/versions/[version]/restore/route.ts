import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, getAccessSource, getRequestInfo, parsePositiveInt } from '@/app/api/_helpers';

type Params = { params: Promise<{ id: string; version: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'write');
  if (!scope.ok) return scope.response;

  const { id, version: versionStr } = await params;
  const version = parsePositiveInt(versionStr);
  if (version === undefined) {
    return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
  }

  const db = getDb();
  const source = getAccessSource(req);
  const stash = db.restoreStashVersion(id, version, source);
  if (!stash) {
    return NextResponse.json({ error: 'Stash or version not found' }, { status: 404 });
  }
  const { ip, userAgent } = getRequestInfo(req);
  db.logAccess(stash.id, source, `restore_version:${version}`, ip, userAgent);
  return NextResponse.json(stash);
}
