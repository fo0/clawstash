import type Database from 'better-sqlite3';
import crypto from 'crypto';
import type {
  BackupCandidate,
  BackupLogEntry,
  BackupStashState,
  BackupSyncState,
  BackupTrigger,
} from '../db-types';

// Keep the log table bounded: the scheduler writes a row per run (including
// skipped no-op runs) plus a row per synced stash, so an unbounded table
// would grow forever on a 5-minute interval. 500 rows ≈ several days of
// history at the tightest schedule, which is plenty for the UI surface.
const MAX_LOG_ROWS = 500;

interface BackupStateRow {
  stash_id: string;
  stash_name: string;
  content_hash: string;
  state: BackupSyncState;
  pending_delete: number;
  last_synced_at: string | null;
  last_commit_sha: string | null;
  error: string | null;
  updated_at: string;
}

interface BackupLogRow {
  id: string;
  run_id: string;
  stash_id: string | null;
  stash_name: string | null;
  trigger_type: BackupTrigger;
  status: 'success' | 'error' | 'skipped';
  action: string | null;
  message: string;
  commit_sha: string | null;
  started_at: string;
  finished_at: string;
}

/**
 * Persistence for the GitHub backup feature (refs #108): generic
 * app_settings key/value storage (config + encrypted token), per-stash sync
 * state (content hash, last commit, error), and the bounded sync log.
 *
 * ClawStashDB exposes these as one-line delegators, matching the
 * Token/Session/Version/Search store pattern.
 */
export class BackupStore {
  constructor(private readonly db: Database.Database) {}

  // === app_settings (generic key/value) ===

  getAppSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      { value: string } | undefined;
    return row ? row.value : null;
  }

  setAppSetting(key: string, value: string): void {
    this.db
      .prepare(
        `
      INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `,
      )
      .run(key, value, new Date().toISOString());
  }

  deleteAppSetting(key: string): void {
    this.db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
  }

  // === backup_state ===

  private rowToState(row: BackupStateRow): BackupStashState {
    return { ...row, pending_delete: row.pending_delete === 1 };
  }

  getBackupState(stashId: string): BackupStashState | null {
    const row = this.db.prepare('SELECT * FROM backup_state WHERE stash_id = ?').get(stashId) as
      BackupStateRow | undefined;
    return row ? this.rowToState(row) : null;
  }

  listBackupStates(): BackupStashState[] {
    const rows = this.db
      .prepare('SELECT * FROM backup_state ORDER BY stash_name')
      .all() as BackupStateRow[];
    return rows.map((row) => this.rowToState(row));
  }

  /** Mark a stash as awaiting sync (used by the mutation hook). */
  markBackupPending(stashId: string, stashName: string): void {
    this.db
      .prepare(
        `
      INSERT INTO backup_state (stash_id, stash_name, state, updated_at)
      VALUES (?, ?, 'pending', ?)
      ON CONFLICT(stash_id) DO UPDATE SET
        stash_name = excluded.stash_name,
        state = CASE WHEN backup_state.state = 'syncing' THEN backup_state.state ELSE 'pending' END,
        updated_at = excluded.updated_at
    `,
      )
      .run(stashId, stashName, new Date().toISOString());
  }

  /**
   * Mark a deleted stash for removal from the backup repo. No-op when the
   * stash was never synced (no state row → nothing exists in the repo).
   */
  markBackupPendingDelete(stashId: string, stashName: string): void {
    this.db
      .prepare(
        `
      UPDATE backup_state
      SET pending_delete = 1, state = 'pending', stash_name = ?, updated_at = ?
      WHERE stash_id = ?
    `,
      )
      .run(stashName, new Date().toISOString(), stashId);
  }

  setBackupStatesSyncing(stashIds: string[]): void {
    if (stashIds.length === 0) return;
    const placeholders = stashIds.map(() => '?').join(', ');
    this.db
      .prepare(
        `UPDATE backup_state SET state = 'syncing', updated_at = ? WHERE stash_id IN (${placeholders})`,
      )
      .run(new Date().toISOString(), ...stashIds);
  }

  recordBackupSuccess(
    stashId: string,
    info: { stashName: string; contentHash: string; commitSha: string | null; syncedAt: string },
  ): void {
    this.db
      .prepare(
        `
      INSERT INTO backup_state (stash_id, stash_name, content_hash, state, pending_delete, last_synced_at, last_commit_sha, error, updated_at)
      VALUES (?, ?, ?, 'idle', 0, ?, ?, NULL, ?)
      ON CONFLICT(stash_id) DO UPDATE SET
        stash_name = excluded.stash_name,
        content_hash = excluded.content_hash,
        state = 'idle',
        pending_delete = 0,
        last_synced_at = excluded.last_synced_at,
        last_commit_sha = excluded.last_commit_sha,
        error = NULL,
        updated_at = excluded.updated_at
    `,
      )
      .run(stashId, info.stashName, info.contentHash, info.syncedAt, info.commitSha, info.syncedAt);
  }

  recordBackupErrors(stashIds: string[], error: string): void {
    if (stashIds.length === 0) return;
    const placeholders = stashIds.map(() => '?').join(', ');
    this.db
      .prepare(
        `UPDATE backup_state SET state = 'error', error = ?, updated_at = ? WHERE stash_id IN (${placeholders})`,
      )
      .run(error, new Date().toISOString(), ...stashIds);
  }

  deleteBackupState(stashId: string): void {
    this.db.prepare('DELETE FROM backup_state WHERE stash_id = ?').run(stashId);
  }

  /** All stashes with the fields the sync needs to pick candidates. */
  listBackupCandidates(): BackupCandidate[] {
    const rows = this.db.prepare('SELECT id, name, backup_enabled FROM stashes').all() as {
      id: string;
      name: string;
      backup_enabled: number;
    }[];
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      backup_enabled: row.backup_enabled === 1,
    }));
  }

  // === backup_log ===

  private rowToLogEntry(row: BackupLogRow): BackupLogEntry {
    const { trigger_type, ...rest } = row;
    return { ...rest, trigger: trigger_type };
  }

  insertBackupLogEntries(entries: Omit<BackupLogEntry, 'id'>[]): void {
    if (entries.length === 0) return;
    const insert = this.db.prepare(`
      INSERT INTO backup_log (id, run_id, stash_id, stash_name, trigger_type, status, action, message, commit_sha, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = this.db.transaction(() => {
      for (const e of entries) {
        insert.run(
          crypto.randomUUID(),
          e.run_id,
          e.stash_id,
          e.stash_name,
          e.trigger,
          e.status,
          e.action,
          e.message,
          e.commit_sha,
          e.started_at,
          e.finished_at,
        );
      }
      // Prune oldest rows beyond the cap (started_at + id as tiebreaker so
      // same-timestamp rows from one run are pruned deterministically).
      this.db
        .prepare(
          `
        DELETE FROM backup_log WHERE id NOT IN (
          SELECT id FROM backup_log ORDER BY started_at DESC, id DESC LIMIT ?
        )
      `,
        )
        .run(MAX_LOG_ROWS);
    });
    tx();
  }

  getBackupLog(options: { stashId?: string; limit?: number } = {}): BackupLogEntry[] {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), MAX_LOG_ROWS);
    const rows = options.stashId
      ? (this.db
          .prepare(
            'SELECT * FROM backup_log WHERE stash_id = ? ORDER BY started_at DESC, id DESC LIMIT ?',
          )
          .all(options.stashId, limit) as BackupLogRow[])
      : (this.db
          .prepare('SELECT * FROM backup_log ORDER BY started_at DESC, id DESC LIMIT ?')
          .all(limit) as BackupLogRow[]);
    return rows.map((row) => this.rowToLogEntry(row));
  }
}
