import type { ClawStashDB } from '@/server/db';
import {
  BACKUP_UNHEALTHY_THRESHOLD,
  readBackupConnection,
  readBackupHealth,
  readBackupSettings,
  readBackupToken,
} from '@/server/backup/backup-service';
import { getBackupScheduler } from '@/server/backup/backup-scheduler';

/**
 * Shared response shape for the backup settings surface (GET/PUT settings,
 * token connect/disconnect). The token itself is never part of any
 * response — only the `tokenSet` flag and the connected account login.
 */
export function buildBackupSettingsResponse(db: ClawStashDB) {
  const settings = readBackupSettings(db);
  const health = readBackupHealth(db);
  return {
    settings,
    connection: readBackupConnection(db),
    tokenSet: readBackupToken(db) !== null,
    health,
    unhealthy: health.consecutiveFailures >= BACKUP_UNHEALTHY_THRESHOLD,
    schedulerActive: getBackupScheduler().intervalActive,
  };
}
