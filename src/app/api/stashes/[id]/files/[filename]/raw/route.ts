import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, getAccessSource, getRequestInfo } from '@/app/api/_helpers';

type Params = { params: Promise<{ id: string; filename: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { id, filename } = await params;
  // decodeURIComponent throws URIError on malformed escapes (e.g., a lone `%`).
  // Without this guard the route would 500 instead of returning a clear 400.
  let decodedFilename: string;
  try {
    decodedFilename = decodeURIComponent(filename);
  } catch {
    return NextResponse.json({ error: 'Invalid filename encoding' }, { status: 400 });
  }
  const db = getDb();
  const file = db.getStashFile(id, decodedFilename);
  if (!file) {
    if (!db.stashExists(id)) {
      return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
  const { ip, userAgent } = getRequestInfo(req);
  db.logAccess(id, getAccessSource(req), `read_file:${file.filename}`, ip, userAgent);
  // Always declare UTF-8 charset so non-ASCII bytes render correctly across
  // browsers / proxies (otherwise some default to Latin-1). Force inline
  // disposition + escape the filename for safe use in the header.
  const safeFilename = file.filename.replace(/["\\]/g, '_');
  return new NextResponse(file.content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `inline; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    },
  });
}
