import { getDb } from '../singleton';
import type { BackupTrigger, ClawStashDB, StashMutationEvent } from '../db';
import {
  isBackupConfigured,
  readBackupSettings,
  runBackupSync,
  type BackupRunResult,
  type RunBackupOptions,
} from './backup-service';

/**
 * In-process backup scheduler (refs #108). Owns the three sync triggers:
 *
 *  - scheduled: setInterval at the configured interval
 *  - mutation:  DB mutation listener → debounced run (~10 s after the last
 *               change, so bursts of agent writes coalesce into one run)
 *  - manual:    "Back up now" from the API/UI
 *
 * All runs are serialized through a promise chain — two syncs never race
 * against each other within this process. Cross-process races (e.g. a
 * second ClawStash instance) are handled by the service's ref-update retry.
 *
 * Singleton on globalThis, matching the DB singleton pattern, so Next.js
 * HMR does not spawn duplicate timers. Started from src/instrumentation.ts.
 */

export const MUTATION_DEBOUNCE_MS = 10_000;

type Runner = (trigger: BackupTrigger, opts: RunBackupOptions) => Promise<BackupRunResult>;

export class BackupScheduler {
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingStashIds = new Set<string>();
  private pendingFullSync = false;
  private runChain: Promise<unknown> = Promise.resolve();
  private readonly runner: Runner;
  private readonly debounceMs: number;

  constructor(options: { runner?: Runner; debounceMs?: number } = {}) {
    this.runner = options.runner ?? ((trigger, opts) => runBackupSync(getDb(), trigger, opts));
    this.debounceMs = options.debounceMs ?? MUTATION_DEBOUNCE_MS;
  }

  /** Register the mutation listener on the DB and arm the interval timer. */
  attach(db: ClawStashDB): void {
    db.setMutationListener((event) => this.onMutation(db, event));
    this.applySettings(db);
  }

  onMutation(db: ClawStashDB, event: StashMutationEvent): void {
    try {
      if (!readBackupSettings(db).enabled || !isBackupConfigured(db)) return;
      if (event.action === 'import') {
        // Whole-database swap → full sync (hash diff finds the changes).
        this.pendingFullSync = true;
      } else if (event.action === 'delete' && event.stashId) {
        // Persist the pending deletion (the stash row is gone, so the flag
        // must survive a process restart). The run itself processes pending
        // deletions regardless of scope.
        db.markBackupPendingDelete(event.stashId, event.name ?? '');
        this.pendingStashIds.add(event.stashId);
      } else if (event.stashId) {
        db.markBackupPending(event.stashId, event.name ?? '');
        this.pendingStashIds.add(event.stashId);
      }
      this.scheduleDebounce();
    } catch (err) {
      console.error('[backup] mutation handling failed:', err);
    }
  }

  applySettings(db: ClawStashDB): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    const settings = readBackupSettings(db);
    if (!settings.enabled || settings.intervalMinutes <= 0 || !isBackupConfigured(db)) return;
    this.intervalTimer = setInterval(() => {
      void this.enqueue('scheduled', {});
    }, settings.intervalMinutes * 60_000);
    this.intervalTimer.unref?.();
  }

  triggerManual(opts: RunBackupOptions = {}): Promise<BackupRunResult> {
    return this.enqueue('manual', opts);
  }

  /** Test/observability hook. */
  get intervalActive(): boolean {
    return this.intervalTimer !== null;
  }

  stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingStashIds.clear();
    this.pendingFullSync = false;
  }

  private scheduleDebounce(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.flushPending();
    }, this.debounceMs);
    this.debounceTimer.unref?.();
  }

  private flushPending(): void {
    const ids = [...this.pendingStashIds];
    const full = this.pendingFullSync;
    this.pendingStashIds.clear();
    this.pendingFullSync = false;
    if (ids.length === 0 && !full) return;
    void this.enqueue('mutation', full ? {} : { stashIds: ids });
  }

  private enqueue(trigger: BackupTrigger, opts: RunBackupOptions): Promise<BackupRunResult> {
    const next = this.runChain.then(() => this.runner(trigger, opts));
    // Keep the chain alive after failures; the result surface (per-stash
    // state, health, log) is persisted by the service itself.
    this.runChain = next.then(
      () => undefined,
      (err) => {
        console.error('[backup] sync run failed:', err);
      },
    );
    return next;
  }
}

const globalForBackup = globalThis as unknown as {
  __clawstashBackupScheduler?: BackupScheduler;
};

/** Process-wide scheduler, attached to the DB singleton on first use. */
export function getBackupScheduler(): BackupScheduler {
  if (!globalForBackup.__clawstashBackupScheduler) {
    const scheduler = new BackupScheduler();
    scheduler.attach(getDb());
    globalForBackup.__clawstashBackupScheduler = scheduler;
  }
  return globalForBackup.__clawstashBackupScheduler;
}

/** Entry point for src/instrumentation.ts (server boot). */
export function initBackupScheduler(): void {
  getBackupScheduler();
}

/** Re-arm timers after settings/token writes (called by the API routes). */
export function notifyBackupSettingsChanged(): void {
  getBackupScheduler().applySettings(getDb());
}
