import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { ClawStashDB, type StashMutationEvent } from '../db';

let db: ClawStashDB;

function rawDb(): Database.Database {
  return (db as unknown as { db: Database.Database }).db;
}

beforeEach(() => {
  db = new ClawStashDB(':memory:');
});

afterEach(() => {
  db.close();
});

describe('backup_enabled column', () => {
  it('defaults to enabled on create and round-trips through list/get/search rows', () => {
    const stash = db.createStash({ name: 'A', files: [{ filename: 'a.txt', content: 'x' }] });
    expect(stash.backup_enabled).toBe(true);
    expect(db.getStash(stash.id)!.backup_enabled).toBe(true);
    expect(db.listStashes().stashes[0].backup_enabled).toBe(true);
  });

  it('setStashBackupEnabled flips the flag without a version snapshot', () => {
    const stash = db.createStash({ name: 'A', files: [{ filename: 'a.txt', content: 'x' }] });
    const updated = db.setStashBackupEnabled(stash.id, false)!;
    expect(updated.backup_enabled).toBe(false);
    expect(updated.version).toBe(1); // no version bump
    expect(db.setStashBackupEnabled('missing', true)).toBeNull();
  });

  it('updateStash can flip the flag inside a content update', () => {
    const stash = db.createStash({ name: 'A', files: [{ filename: 'a.txt', content: 'x' }] });
    const updated = db.updateStash(stash.id, { name: 'B', backup_enabled: false })!;
    expect(updated.name).toBe('B');
    expect(updated.backup_enabled).toBe(false);
  });

  it('importAllData preserves an explicit opt-out and defaults the rest to enabled', () => {
    const row = {
      description: '',
      tags: '[]',
      metadata: '{}',
      version: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    db.importAllData({
      stashes: [
        { id: 's1', name: 'In', ...row },
        { id: 's2', name: 'Out', ...row, backup_enabled: false },
      ],
      stash_files: [],
    });
    expect(db.getStash('s1')!.backup_enabled).toBe(true);
    expect(db.getStash('s2')!.backup_enabled).toBe(false);
  });
});

describe('mutation listener', () => {
  function captureEvents(): StashMutationEvent[] {
    const events: StashMutationEvent[] = [];
    db.setMutationListener((event) => events.push(event));
    return events;
  }

  it('fires for create / update / archive / backup-toggle / delete with the stash name', () => {
    const events = captureEvents();
    const stash = db.createStash({ name: 'Alpha', files: [{ filename: 'a.txt', content: 'x' }] });
    db.updateStash(stash.id, { name: 'Beta' });
    db.archiveStash(stash.id, true);
    db.setStashBackupEnabled(stash.id, false);
    db.deleteStash(stash.id);

    expect(events).toEqual([
      { action: 'create', stashId: stash.id, name: 'Alpha' },
      { action: 'update', stashId: stash.id, name: 'Beta' },
      { action: 'update', stashId: stash.id, name: 'Beta' },
      { action: 'update', stashId: stash.id, name: 'Beta' },
      { action: 'delete', stashId: stash.id, name: 'Beta' },
    ]);
  });

  it('fires a whole-database event on import', () => {
    const events = captureEvents();
    db.importAllData({ stashes: [], stash_files: [] });
    expect(events).toEqual([{ action: 'import' }]);
  });

  it('does not fire for failed mutations', () => {
    const events = captureEvents();
    expect(db.updateStash('missing', { name: 'X' })).toBeNull();
    expect(db.deleteStash('missing')).toBe(false);
    expect(db.archiveStash('missing', true)).toBeNull();
    expect(events).toEqual([]);
  });

  it('a throwing listener never breaks the mutation', () => {
    db.setMutationListener(() => {
      throw new Error('listener exploded');
    });
    const stash = db.createStash({ name: 'A', files: [{ filename: 'a.txt', content: 'x' }] });
    expect(db.getStash(stash.id)).not.toBeNull();
    expect(db.deleteStash(stash.id)).toBe(true);
  });
});

describe('backup state store', () => {
  it('app settings round-trip and overwrite', () => {
    expect(db.getAppSetting('k')).toBeNull();
    db.setAppSetting('k', 'v1');
    db.setAppSetting('k', 'v2');
    expect(db.getAppSetting('k')).toBe('v2');
    db.deleteAppSetting('k');
    expect(db.getAppSetting('k')).toBeNull();
  });

  it('markBackupPending upserts but never downgrades a syncing row', () => {
    db.markBackupPending('s1', 'One');
    expect(db.getBackupState('s1')!.state).toBe('pending');

    db.setBackupStatesSyncing(['s1']);
    db.markBackupPending('s1', 'One renamed');
    const state = db.getBackupState('s1')!;
    expect(state.state).toBe('syncing');
    expect(state.stash_name).toBe('One renamed');
  });

  it('markBackupPendingDelete is a no-op without a prior state row', () => {
    db.markBackupPendingDelete('never-synced', 'Ghost');
    expect(db.getBackupState('never-synced')).toBeNull();

    db.markBackupPending('s1', 'One');
    db.markBackupPendingDelete('s1', 'One');
    expect(db.getBackupState('s1')!.pending_delete).toBe(true);
  });

  it('recordBackupSuccess clears error + pending flags; recordBackupErrors sets them', () => {
    db.markBackupPending('s1', 'One');
    db.recordBackupErrors(['s1'], 'broken');
    expect(db.getBackupState('s1')!.state).toBe('error');
    expect(db.getBackupState('s1')!.error).toBe('broken');

    db.recordBackupSuccess('s1', {
      stashName: 'One',
      contentHash: 'hash',
      commitSha: 'abc',
      syncedAt: '2026-06-12T00:00:00.000Z',
    });
    const state = db.getBackupState('s1')!;
    expect(state.state).toBe('idle');
    expect(state.error).toBeNull();
    expect(state.pending_delete).toBe(false);
    expect(state.last_commit_sha).toBe('abc');
  });

  it('listBackupCandidates reflects the backup_enabled flag', () => {
    const a = db.createStash({ name: 'A', files: [{ filename: 'a.txt', content: 'x' }] });
    db.setStashBackupEnabled(a.id, false);
    const candidates = db.listBackupCandidates();
    expect(candidates).toEqual([{ id: a.id, name: 'A', backup_enabled: false }]);
  });

  it('caps the backup log at 500 rows, dropping the oldest', () => {
    const base = {
      run_id: 'r',
      stash_id: null,
      stash_name: null,
      trigger: 'scheduled' as const,
      status: 'skipped' as const,
      action: null,
      message: '',
      commit_sha: null,
    };
    for (let i = 0; i < 510; i++) {
      db.insertBackupLogEntries([
        {
          ...base,
          started_at: `2026-01-01T00:00:${String(i % 60).padStart(2, '0')}.${String(i).padStart(3, '0')}Z`,
          finished_at: '2026-01-01T00:10:00.000Z',
          message: `entry-${i}`,
        },
      ]);
    }
    const count = rawDb().prepare('SELECT COUNT(*) AS c FROM backup_log').get() as { c: number };
    expect(count.c).toBe(500);
  });

  it('getBackupLog filters by stash and honours the limit', () => {
    const base = {
      run_id: 'r',
      trigger: 'manual' as const,
      status: 'success' as const,
      action: 'update',
      message: '',
      commit_sha: 'sha',
      started_at: '2026-01-01T00:00:00.000Z',
      finished_at: '2026-01-01T00:00:01.000Z',
    };
    db.insertBackupLogEntries([
      { ...base, stash_id: 's1', stash_name: 'One' },
      { ...base, stash_id: 's2', stash_name: 'Two' },
      { ...base, stash_id: null, stash_name: null, action: null },
    ]);
    expect(db.getBackupLog({ stashId: 's1' })).toHaveLength(1);
    expect(db.getBackupLog()).toHaveLength(3);
    expect(db.getBackupLog({ limit: 2 })).toHaveLength(2);
  });
});
