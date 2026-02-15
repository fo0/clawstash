import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope } from '@/app/api/_helpers';

type Params = { params: Promise<{ id: string; version: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { id, version: versionStr } = await params;
  const version = parseInt(versionStr, 10);
  if (!Number.isInteger(version) || version < 1) {
    return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
  }

  const versionData = getDb().getStashVersion(id, version);
  if (!versionData) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }
  return NextResponse.json(versionData);
}
