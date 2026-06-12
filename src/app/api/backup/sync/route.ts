import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope } from '@/app/api/_helpers';
import { BackupSyncSchema, formatZodError } from '@/server/validation';
import { getBackupScheduler } from '@/server/backup/backup-scheduler';

// POST /api/backup/sync — manual "Back up now" (write scope). Without a
// stashId it backs up everything; with one it scopes the run to that stash
// (pending deletions are always processed). Triggering a sync needs only
// write scope: it cannot change WHERE data goes — the target repo is
// admin-configured.
export async function POST(req: NextRequest) {
  const scope = checkScope(req, 'write');
  if (!scope.ok) return scope.response;

  // Lenient body handling: an empty body means "back up everything".
  let data: unknown = {};
  try {
    const text = await req.text();
    if (text.trim()) data = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BackupSyncSchema.safeParse(data);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const db = getDb();
  const { stashId, force } = parsed.data;
  if (stashId && !db.stashExists(stashId) && !db.getBackupState(stashId)) {
    return NextResponse.json({ error: 'Stash not found' }, { status: 404 });
  }

  const result = await getBackupScheduler().triggerManual({
    stashIds: stashId ? [stashId] : undefined,
    force,
  });
  if (result.status === 'not_configured') {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json(result);
}
