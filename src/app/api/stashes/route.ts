import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, getAccessSource } from '@/app/api/_helpers';
import { CreateStashSchema, formatZodError } from '@/server/validation';

// GET /api/stashes - List stashes (FTS5 ranked search when search query is present)
export async function GET(req: NextRequest) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const db = getDb();
  const { searchParams } = req.nextUrl;
  const search = searchParams.get('search') || undefined;
  const tag = searchParams.get('tag') || undefined;
  const archivedParam = searchParams.get('archived');
  const archived = archivedParam === 'true' ? true : archivedParam === 'false' ? false : undefined;
  const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

  // Use FTS5 ranked search when a search query is present
  if (search) {
    const result = db.searchStashes(search, { tag, archived, page, limit });
    return NextResponse.json(result);
  }

  const result = db.listStashes({ tag, archived, page, limit });
  return NextResponse.json(result);
}

// POST /api/stashes - Create stash
export async function POST(req: NextRequest) {
  const scope = checkScope(req, 'write');
  if (!scope.ok) return scope.response;

  const db = getDb();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateStashSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const { name, description, tags, metadata, files } = parsed.data;
  const stash = db.createStash({ name, description, tags, metadata, files });
  const source = getAccessSource(req);
  db.logAccess(stash.id, source, 'create', req.headers.get('x-forwarded-for') || undefined, req.headers.get('user-agent') || undefined);
  return NextResponse.json(stash, { status: 201 });
}
