import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope } from '@/app/api/_helpers';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { id } = await params;
  const db = getDb();
  if (!db.stashExists(id)) {
    return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
  }

  const v1 = parseInt(req.nextUrl.searchParams.get('v1') || '', 10);
  const v2 = parseInt(req.nextUrl.searchParams.get('v2') || '', 10);
  if (!Number.isInteger(v1) || v1 < 1 || !Number.isInteger(v2) || v2 < 1 || v1 === v2) {
    return NextResponse.json({ error: 'Provide two different positive version numbers as v1 and v2 query parameters' }, { status: 400 });
  }

  const version1 = db.getStashVersion(id, v1);
  const version2 = db.getStashVersion(id, v2);
  if (!version1 || !version2) {
    return NextResponse.json({ error: 'One or both versions not found' }, { status: 404 });
  }
  return NextResponse.json({ v1: version1, v2: version2 });
}
