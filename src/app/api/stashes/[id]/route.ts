import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, getAccessSource } from '@/app/api/_helpers';
import { UpdateStashSchema, formatZodError } from '@/server/validation';

type Params = { params: Promise<{ id: string }> };

// GET /api/stashes/:id
export async function GET(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { id } = await params;
  const db = getDb();
  const stash = db.getStash(id);
  if (!stash) {
    return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
  }
  db.logAccess(stash.id, getAccessSource(req), 'read', req.headers.get('x-forwarded-for') || undefined, req.headers.get('user-agent') || undefined);
  return NextResponse.json(stash);
}

// PATCH /api/stashes/:id
export async function PATCH(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'write');
  if (!scope.ok) return scope.response;

  const { id } = await params;
  const db = getDb();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = UpdateStashSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const { name, description, tags, metadata, files, archived } = parsed.data;
  const source = getAccessSource(req);

  // Handle archive toggle separately (doesn't create a new version)
  if (archived !== undefined && name === undefined && description === undefined && tags === undefined && metadata === undefined && files === undefined) {
    const stash = db.archiveStash(id, archived);
    if (!stash) {
      return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
    }
    db.logAccess(stash.id, source, archived ? 'archive' : 'unarchive', req.headers.get('x-forwarded-for') || undefined, req.headers.get('user-agent') || undefined);
    return NextResponse.json(stash);
  }

  // If archived is set alongside other fields, apply archive first
  if (archived !== undefined) {
    const archiveResult = db.archiveStash(id, archived);
    if (!archiveResult) {
      return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
    }
  }

  const stash = db.updateStash(id, { name, description, tags, metadata, files }, source);
  if (!stash) {
    return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
  }
  db.logAccess(stash.id, source, 'update', req.headers.get('x-forwarded-for') || undefined, req.headers.get('user-agent') || undefined);
  return NextResponse.json(stash);
}

// DELETE /api/stashes/:id
export async function DELETE(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'write');
  if (!scope.ok) return scope.response;

  const { id } = await params;
  const db = getDb();
  const deleted = db.deleteStash(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
