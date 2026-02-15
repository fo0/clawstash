import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, getAccessSource } from '@/app/api/_helpers';

// GET /api/stashes - List stashes
export async function GET(req: NextRequest) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const db = getDb();
  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search') || undefined;
  const tag = searchParams.get('tag') || undefined;
  const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

  const result = db.listStashes({ search, tag, page, limit });
  return NextResponse.json(result);
}

// POST /api/stashes - Create stash
export async function POST(req: NextRequest) {
  const scope = checkScope(req, 'write');
  if (!scope.ok) return scope.response;

  const db = getDb();
  const body = await req.json();
  const { name, description, tags, metadata, files } = body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'At least one file is required' }, { status: 400 });
  }

  for (const file of files) {
    if (!file.filename || typeof file.filename !== 'string') {
      return NextResponse.json({ error: 'Each file must have a filename' }, { status: 400 });
    }
  }

  const stash = db.createStash({ name, description, tags, metadata, files });
  const source = getAccessSource(req);
  db.logAccess(stash.id, source, 'create', req.headers.get('x-forwarded-for') || undefined, req.headers.get('user-agent') || undefined);
  return NextResponse.json(stash, { status: 201 });
}
