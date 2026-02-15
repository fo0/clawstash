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
  return NextResponse.json(db.getStashVersions(id));
}
