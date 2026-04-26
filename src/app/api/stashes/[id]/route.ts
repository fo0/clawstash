import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, getAccessSource, parseJsonBody, getRequestInfo } from '@/app/api/_helpers';
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
  const { ip, userAgent } = getRequestInfo(req);
  db.logAccess(stash.id, getAccessSource(req), 'read', ip, userAgent);
  return NextResponse.json(stash);
}

// PATCH /api/stashes/:id
export async function PATCH(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'write');
  if (!scope.ok) return scope.response;

  const { id } = await params;
  const db = getDb();
  const body = await parseJsonBody(req);
  if ('error' in body) return body.error;

  const parsed = UpdateStashSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const { name, description, tags, metadata, files, archived } = parsed.data;
  const source = getAccessSource(req);
  const { ip, userAgent } = getRequestInfo(req);

  // Handle archive toggle separately (doesn't create a new version)
  if (archived !== undefined && name === undefined && description === undefined && tags === undefined && metadata === undefined && files === undefined) {
    const stash = db.archiveStash(id, archived);
    if (!stash) {
      return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
    }
    db.logAccess(stash.id, source, archived ? 'archive' : 'unarchive', ip, userAgent);
    return NextResponse.json(stash);
  }

  // archived alongside content fields — pass through to updateStash so the
  // archive flip happens INSIDE the same transaction. Previously the route
  // called archiveStash() (one tx) and then updateStash() (another tx); a
  // thrown updateStash left the archive flag flipped without a corresponding
  // content change. updateStash now accepts `archived` directly.
  const stash = db.updateStash(id, { name, description, tags, metadata, files, archived }, source);
  if (!stash) {
    return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
  }
  db.logAccess(stash.id, source, 'update', ip, userAgent);
  if (archived !== undefined) {
    db.logAccess(stash.id, source, archived ? 'archive' : 'unarchive', ip, userAgent);
  }
  return NextResponse.json(stash);
}

// DELETE /api/stashes/:id
// No logAccess here: access_log has ON DELETE CASCADE on stash_id,
// so any log entry would be immediately removed with the stash.
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
