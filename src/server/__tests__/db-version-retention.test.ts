import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type Database from 'better-sqlite3';
import { ClawStashDB } from '../db';
import { DEFAULT_STASH_VERSION_LIMIT, resolveStashVersionLimit } from '../stores/version-store';

/**
 * `stash_versions` retention (refs #535).
 *
 * The cap deletes user data, so these tests pin the guarantees the feature was
 * built around: it only ever prunes the one stash that just got a new
 * snapshot, it leaves a history below the cap completely untouched, `0`
 * disables it outright, and every prune is logged.
 */
function inner(db: ClawStashDB): Database.Database {
  return (db as unknown as { db: Database.Database }).db;
}

function versionNumbers(db: ClawStashDB, stashId: string): number[] {
  return (
    inner(db)
      .prepare('SELECT version FROM stash_versions WHERE stash_id = ? ORDER BY version ASC')
      .all(stashId) as { version: number }[]
  ).map((r) => r.version);
}

function versionFileCount(db: ClawStashDB): number {
  return (inner(db).prepare('SELECT COUNT(*) AS c FROM stash_version_files').get() as { c: number })
    .c;
}

/** Create a stash and push it through `updates` successive updateStash calls. */
function makeHistory(db: ClawStashDB, updates: number): string {
  const stash = db.createStash({
    name: 'v0',
    files: [{ filename: 'f.txt', content: 'c0' }],
  });
  for (let i = 1; i <= updates; i++) {
    db.updateStash(stash.id, { name: `v${i}`, files: [{ filename: 'f.txt', content: `c${i}` }] });
  }
  return stash.id;
}

describe('resolveStashVersionLimit', () => {
  it('falls back to the default for unset and blank values', () => {
    expect(resolveStashVersionLimit(undefined)).toBe(DEFAULT_STASH_VERSION_LIMIT);
    expect(resolveStashVersionLimit('')).toBe(DEFAULT_STASH_VERSION_LIMIT);
    expect(resolveStashVersionLimit('   ')).toBe(DEFAULT_STASH_VERSION_LIMIT);
  });

  it('accepts 0 as "unlimited" rather than treating it as a typo', () => {
    expect(resolveStashVersionLimit('0')).toBe(0);
  });

  it('accepts any other non-negative integer', () => {
    expect(resolveStashVersionLimit('1')).toBe(1);
    expect(resolveStashVersionLimit('25')).toBe(25);
  });

  it('falls back to the default for negative, fractional and non-numeric values', () => {
    expect(resolveStashVersionLimit('-5')).toBe(DEFAULT_STASH_VERSION_LIMIT);
    expect(resolveStashVersionLimit('2.5')).toBe(DEFAULT_STASH_VERSION_LIMIT);
    expect(resolveStashVersionLimit('abc')).toBe(DEFAULT_STASH_VERSION_LIMIT);
    expect(resolveStashVersionLimit('NaN')).toBe(DEFAULT_STASH_VERSION_LIMIT);
  });

  it('has a generous default so an upgrade does not silently discard history', () => {
    expect(DEFAULT_STASH_VERSION_LIMIT).toBeGreaterThanOrEqual(100);
  });
});

describe('stash_versions retention', () => {
  const originalLimit = process.env.STASH_VERSION_LIMIT;
  let db: ClawStashDB | undefined;

  beforeEach(() => {
    db = undefined;
  });

  afterEach(() => {
    db?.close();
    if (originalLimit === undefined) delete process.env.STASH_VERSION_LIMIT;
    else process.env.STASH_VERSION_LIMIT = originalLimit;
    vi.restoreAllMocks();
  });

  /** The limit is read when the DB (and with it VersionStore) is constructed. */
  function openDb(limit?: string): ClawStashDB {
    if (limit === undefined) delete process.env.STASH_VERSION_LIMIT;
    else process.env.STASH_VERSION_LIMIT = limit;
    db = new ClawStashDB(':memory:');
    return db;
  }

  it('leaves a history that stays below the cap completely untouched', () => {
    const d = openDb('10');
    const stashId = makeHistory(d, 4);

    // 5 updates would be needed to reach 5 snapshots; 4 stay well under 10.
    expect(versionNumbers(d, stashId)).toEqual([1, 2, 3, 4]);
  });

  it('caps the history at the configured limit once it is exceeded', () => {
    const d = openDb('3');
    const stashId = makeHistory(d, 6);

    const versions = versionNumbers(d, stashId);
    expect(versions).toHaveLength(3);
    // The newest snapshots survive; the oldest ones are the ones dropped.
    expect(versions).toEqual([4, 5, 6]);
  });

  it('drops the files of a pruned snapshot with it (FK cascade)', () => {
    const d = openDb('2');
    const stashId = makeHistory(d, 6);

    expect(versionNumbers(d, stashId)).toHaveLength(2);
    // One file per snapshot in this fixture, so the file table has to shrink
    // in lockstep rather than leaving orphans behind.
    expect(versionFileCount(d)).toBe(2);
  });

  it('prunes only the stash that was just updated', () => {
    const d = openDb('2');
    const untouched = makeHistory(d, 4);
    const before = versionNumbers(d, untouched);

    const other = makeHistory(d, 4);

    expect(versionNumbers(d, other)).toHaveLength(2);
    // The first stash received no new snapshot, so nothing of its history
    // may have been swept away as a side effect.
    expect(versionNumbers(d, untouched)).toEqual(before);
  });

  it('disables pruning entirely at 0', () => {
    const d = openDb('0');
    const stashId = makeHistory(d, 8);

    expect(versionNumbers(d, stashId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('keeps the full history for an invalid value instead of guessing a small cap', () => {
    const d = openDb('not-a-number');
    const stashId = makeHistory(d, 6);

    expect(versionNumbers(d, stashId)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('logs every prune with the count, the stash and the effective limit', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const d = openDb('2');
    const stashId = makeHistory(d, 5);

    const messages = log.mock.calls.map((args) => String(args[0]));
    const pruneLogs = messages.filter((m) => m.includes('Pruned'));
    expect(pruneLogs.length).toBeGreaterThan(0);
    expect(pruneLogs[0]).toContain(stashId);
    expect(pruneLogs[0]).toContain('STASH_VERSION_LIMIT=2');
  });

  it('stays silent while nothing is actually pruned', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const d = openDb('50');
    makeHistory(d, 4);

    const pruneLogs = log.mock.calls
      .map((args) => String(args[0]))
      .filter((m) => m.includes('Pruned'));
    expect(pruneLogs).toHaveLength(0);
  });
});
