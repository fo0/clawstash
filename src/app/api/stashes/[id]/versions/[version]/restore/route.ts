import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, getAccessSource } from '@/app/api/_helpers';

type Params = { params: Promise<{ id: string; version: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'write');
  if (!scope.ok) return scope.response;

  const { id, version: versionStr } = await params;
  const version = parseInt(versionStr, 10);
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
  }

  const db = getDb();
  const source = getAccessSource(req);
  const stash = db.restoreStashVersion(id, version, source);
  if (!stash) {
    return NextResponse.json({ error: 'Stash or version not found' }, { status: 404 });
  }
  db.logAccess(stash.id, source, `restore_version:${version}`, req.headers.get('x-forwarded-for') || undefined, req.headers.get('user-agent') || undefined);
  return NextResponse.json(stash);
}
