import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope } from '@/app/api/_helpers';

type Params = { params: Promise<{ id: string; filename: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { id, filename } = await params;
  const decodedFilename = decodeURIComponent(filename);
  const db = getDb();
  const file = db.getStashFile(id, decodedFilename);
  if (!file) {
    if (!db.stashExists(id)) {
      return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
  db.logAccess(id, 'api', `read_file:${file.filename}`, req.headers.get('x-forwarded-for') || undefined, req.headers.get('user-agent') || undefined);
  return new NextResponse(file.content, { headers: { 'Content-Type': 'text/plain' } });
}
