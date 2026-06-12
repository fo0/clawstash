import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope } from '@/app/api/_helpers';
import {
  BACKUP_UNHEALTHY_THRESHOLD,
  isBackupConfigured,
  readBackupHealth,
  readBackupSettings,
} from '@/server/backup/backup-service';

// GET /api/backup/status[?stashId=] — sync state for the UI badges (read
// scope: callers with read access can already see all stash content; this
// only adds sync bookkeeping plus the target repo name for commit links).
export async function GET(req: NextRequest) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const db = getDb();
  const settings = readBackupSettings(db);
  const health = readBackupHealth(db);
  const stashId = req.nextUrl.searchParams.get('stashId');

  const states = stashId
    ? [db.getBackupState(stashId)].filter((s) => s !== null)
    : db.listBackupStates();

  return NextResponse.json({
    configured: isBackupConfigured(db),
    enabled: settings.enabled,
    repoFullName:
      settings.repoOwner && settings.repoName ? `${settings.repoOwner}/${settings.repoName}` : null,
    branch: settings.branch,
    intervalMinutes: settings.intervalMinutes,
    health,
    unhealthy: health.consecutiveFailures >= BACKUP_UNHEALTHY_THRESHOLD,
    states,
  });
}
