import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClawStashDB } from '../../db';
import { BackupScheduler } from '../backup-scheduler';
import {
  DEFAULT_BACKUP_SETTINGS,
  storeBackupToken,
  writeBackupSettings,
  type BackupRunResult,
} from '../backup-service';
import { resetEncryptionKeyCache } from '../backup-crypto';

const OK_RESULT: BackupRunResult = {
  status: 'success',
  message: 'ok',
  synced: 1,
  removed: 0,
  commitSha: 'sha',
};

let db: ClawStashDB;
let scheduler: BackupScheduler | null;

function configureBackup(overrides: Partial<typeof DEFAULT_BACKUP_SETTINGS> = {}) {
  writeBackupSettings(db, {
    ...DEFAULT_BACKUP_SETTINGS,
    enabled: true,
    repoOwner: 'owner',
    repoName: 'repo',
    ...overrides,
  });
  storeBackupToken(db, `ghp_${'x'.repeat(36)}`, {
    method: 'pat',
    login: 'octo',
    connectedAt: new Date().toISOString(),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('CLAWSTASH_ENCRYPTION_KEY', 'ef'.repeat(32));
  resetEncryptionKeyCache();
  db = new ClawStashDB(':memory:');
  scheduler = null;
});

afterEach(() => {
  scheduler?.stop();
  db.close();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetEncryptionKeyCache();
});

describe('BackupScheduler', () => {
  it('debounces mutations into one scoped run and marks states pending', async () => {
    configureBackup();
    const runner = vi.fn().mockResolvedValue(OK_RESULT);
    scheduler = new BackupScheduler({ runner, debounceMs: 1000 });
    scheduler.attach(db);

    const a = db.createStash({ name: 'A', files: [{ filename: 'a.txt', content: 'a' }] });
    const b = db.createStash({ name: 'B', files: [{ filename: 'b.txt', content: 'b' }] });

    expect(db.getBackupState(a.id)?.state).toBe('pending');
    expect(runner).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(999);
    expect(runner).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(runner).toHaveBeenCalledTimes(1);
    const [trigger, opts] = runner.mock.calls[0];
    expect(trigger).toBe('mutation');
    expect(new Set(opts.stashIds)).toEqual(new Set([a.id, b.id]));
  });

  it('a mutation mid-debounce restarts the timer (coalescing)', async () => {
    configureBackup();
    const runner = vi.fn().mockResolvedValue(OK_RESULT);
    scheduler = new BackupScheduler({ runner, debounceMs: 1000 });
    scheduler.attach(db);

    db.createStash({ name: 'A', files: [{ filename: 'a.txt', content: 'a' }] });
    await vi.advanceTimersByTimeAsync(800);
    db.createStash({ name: 'B', files: [{ filename: 'b.txt', content: 'b' }] });
    await vi.advanceTimersByTimeAsync(800);
    expect(runner).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(runner).toHaveBeenCalledTimes(1);
  });

  it('records pending deletions with the last known name', async () => {
    configureBackup();
    const runner = vi.fn().mockResolvedValue(OK_RESULT);
    scheduler = new BackupScheduler({ runner, debounceMs: 1000 });
    scheduler.attach(db);

    const stash = db.createStash({ name: 'Doomed', files: [{ filename: 'd.txt', content: 'd' }] });
    await vi.advanceTimersByTimeAsync(1000); // flush the create
    db.recordBackupSuccess(stash.id, {
      stashName: 'Doomed',
      contentHash: 'h',
      commitSha: 'c',
      syncedAt: new Date().toISOString(),
    });

    db.deleteStash(stash.id);
    const state = db.getBackupState(stash.id)!;
    expect(state.pending_delete).toBe(true);
    expect(state.stash_name).toBe('Doomed');
  });

  it('an import event triggers a full (unscoped) run', async () => {
    configureBackup();
    const runner = vi.fn().mockResolvedValue(OK_RESULT);
    scheduler = new BackupScheduler({ runner, debounceMs: 1000 });
    scheduler.attach(db);

    db.importAllData({ stashes: [], stash_files: [] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][1]).toEqual({});
  });

  it('does nothing on mutations while the backup is unconfigured', async () => {
    const runner = vi.fn().mockResolvedValue(OK_RESULT);
    scheduler = new BackupScheduler({ runner, debounceMs: 1000 });
    scheduler.attach(db);

    const stash = db.createStash({ name: 'A', files: [{ filename: 'a.txt', content: 'a' }] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(runner).not.toHaveBeenCalled();
    expect(db.getBackupState(stash.id)).toBeNull();
  });

  it('arms the interval timer only when enabled + configured, and re-arms on settings changes', async () => {
    const runner = vi.fn().mockResolvedValue(OK_RESULT);
    scheduler = new BackupScheduler({ runner, debounceMs: 1000 });
    scheduler.attach(db);
    expect(scheduler.intervalActive).toBe(false);

    configureBackup({ intervalMinutes: 5 });
    scheduler.applySettings(db);
    expect(scheduler.intervalActive).toBe(true);

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][0]).toBe('scheduled');

    configureBackup({ intervalMinutes: 0 });
    scheduler.applySettings(db);
    expect(scheduler.intervalActive).toBe(false);
  });

  it('serializes runs — a manual trigger waits for the running sync', async () => {
    configureBackup();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const runner = vi.fn(async (trigger: string) => {
      order.push(`start:${trigger}`);
      if (runner.mock.calls.length === 1) await firstGate;
      order.push(`end:${trigger}`);
      return OK_RESULT;
    });
    scheduler = new BackupScheduler({ runner: runner as never, debounceMs: 1000 });

    const first = scheduler.triggerManual({ force: true });
    const second = scheduler.triggerManual({});
    // Poll until the first run has started rather than asserting after a single
    // microtask tick — the tick count is an implementation detail of enqueue()
    // and a brittle peg for this serialization guarantee (#112).
    await vi.waitFor(() => expect(order).toEqual(['start:manual']));

    releaseFirst();
    await first;
    await second;
    expect(order).toEqual(['start:manual', 'end:manual', 'start:manual', 'end:manual']);
  });

  it('keeps the queue alive after a failing run', async () => {
    configureBackup();
    const runner = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(OK_RESULT);
    scheduler = new BackupScheduler({ runner, debounceMs: 1000 });

    await expect(scheduler.triggerManual({})).rejects.toThrow('boom');
    await expect(scheduler.triggerManual({})).resolves.toEqual(OK_RESULT);
  });
});
