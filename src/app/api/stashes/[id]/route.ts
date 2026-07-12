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

  const { name, description, tags, metadata, files, archived, backup_enabled } = parsed.data;
  const source = getAccessSource(req);
  const { ip, userAgent } = getRequestInfo(req);

  // True when the PATCH carries any field other than the flag toggles —
  // drives the "flag-only fast paths" below (no new version, simpler
  // logAccess). Closes BACKLOG #20.
  const hasContentChanges =
    name !== undefined ||
    description !== undefined ||
    tags !== undefined ||
    metadata !== undefined ||
    files !== undefined;

  // Handle flag-only toggles separately (no version snapshot). Both flags are
  // flipped inside ONE transaction via setStashFlags so that sending `archived`
  // and `backup_enabled` together can never leave one flag flipped and the
  // other not (BACKLOG #114). Previously this ran archiveStash() and then
  // setStashBackupEnabled() as two independent transactions.
  if (!hasContentChanges && (archived !== undefined || backup_enabled !== undefined)) {
    const stash = db.setStashFlags(id, { archived, backup_enabled });
    if (!stash) {
      return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
    }
    // logAccess after the atomic update so each flip is still recorded
    // individually with its specific action verb.
    if (archived !== undefined) {
      db.logAccess(stash.id, source, archived ? 'archive' : 'unarchive', ip, userAgent);
    }
    if (backup_enabled !== undefined) {
      db.logAccess(
        stash.id,
        source,
        backup_enabled ? 'backup_enable' : 'backup_disable',
        ip,
        userAgent,
      );
    }
    return NextResponse.json(stash);
  }

  // Flags alongside content fields — pass through to updateStash so the
  // flips happen INSIDE the same transaction. Previously the route called
  // archiveStash() (one tx) and then updateStash() (another tx); a thrown
  // updateStash left the archive flag flipped without a corresponding
  // content change. updateStash accepts both flags directly.
  const stash = db.updateStash(
    id,
    { name, description, tags, metadata, files, archived, backup_enabled },
    source,
  );
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
// No logAccess here: access_log has ON DELETE CASCADE on stash_id, so any log
// entry would be immediately removed with the stash. The deletion is instead
// recorded in the non-cascading deletion_audit table (BACKLOG #42).
export async function DELETE(req: NextRequest, { params }: Params) {
  const scope = checkScope(req, 'write');
  if (!scope.ok) return scope.response;

  const { id } = await params;
  const db = getDb();
  const { ip, userAgent } = getRequestInfo(req);
  const deleted = db.deleteStash(id, { source: getAccessSource(req), ip, userAgent });
  if (!deleted) {
    return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
