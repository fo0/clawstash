import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import { ClawStashDB, MAX_ACCESS_LOG_ROWS, ACCESS_LOG_PRUNE_INTERVAL } from '../db';

/**
 * `access_log` retention (mirrors the `backup_log` MAX_LOG_ROWS pattern).
 *
 * One row is written per read/create/update across REST, MCP and the UI, so
 * without pruning the table grows forever. The prune is amortised over
 * ACCESS_LOG_PRUNE_INTERVAL inserts, which is what these tests pin down:
 * the table never exceeds cap + interval, the newest rows survive and the
 * oldest ones are the ones dropped.
 */
function inner(db: ClawStashDB): Database.Database {
  return (db as unknown as { db: Database.Database }).db;
}

/** Seed `count` access_log rows directly, oldest first, in one transaction. */
function seedAccessLog(db: ClawStashDB, stashId: string, count: number): void {
  const raw = inner(db);
  const insert = raw.prepare(
    'INSERT INTO access_log (id, stash_id, source, action, timestamp) VALUES (?, ?, ?, ?, ?)',
  );
  const base = Date.UTC(2020, 0, 1);
  raw.transaction(() => {
    for (let i = 0; i < count; i++) {
      insert.run(`seed-${i}`, stashId, 'api', `seed:${i}`, new Date(base + i * 1000).toISOString());
    }
  })();
}

function accessLogCount(db: ClawStashDB): number {
  return (inner(db).prepare('SELECT COUNT(*) AS c FROM access_log').get() as { c: number }).c;
}

describe('access_log retention', () => {
  let db: ClawStashDB;
  let stashId: string;

  beforeEach(() => {
    db = new ClawStashDB(':memory:');
    stashId = db.createStash({
      name: 'retention',
      files: [{ filename: 'a.txt', content: 'x' }],
    }).id;
  });

  afterEach(() => {
    db.close();
  });

  it('does not prune before the interval is reached', () => {
    seedAccessLog(db, stashId, MAX_ACCESS_LOG_ROWS + 10);
    const before = accessLogCount(db);

    for (let i = 0; i < ACCESS_LOG_PRUNE_INTERVAL - 1; i++) {
      db.logAccess(stashId, 'api', 'read');
    }

    expect(accessLogCount(db)).toBe(before + ACCESS_LOG_PRUNE_INTERVAL - 1);
  });

  it('caps the table at MAX_ACCESS_LOG_ROWS once the interval elapses', () => {
    seedAccessLog(db, stashId, MAX_ACCESS_LOG_ROWS);

    for (let i = 0; i < ACCESS_LOG_PRUNE_INTERVAL; i++) {
      db.logAccess(stashId, 'api', 'read');
    }

    expect(accessLogCount(db)).toBe(MAX_ACCESS_LOG_ROWS);
  });

  it('keeps the newest entries and drops the oldest', () => {
    seedAccessLog(db, stashId, MAX_ACCESS_LOG_ROWS);

    for (let i = 0; i < ACCESS_LOG_PRUNE_INTERVAL; i++) {
      db.logAccess(stashId, 'api', `fresh:${i}`);
    }

    const remainingSeeds = (
      inner(db)
        .prepare("SELECT COUNT(*) AS c FROM access_log WHERE action LIKE 'seed:%'")
        .get() as { c: number }
    ).c;
    const remainingFresh = (
      inner(db)
        .prepare("SELECT COUNT(*) AS c FROM access_log WHERE action LIKE 'fresh:%'")
        .get() as { c: number }
    ).c;

    // Every new entry survives; exactly as many old ones were evicted.
    expect(remainingFresh).toBe(ACCESS_LOG_PRUNE_INTERVAL);
    expect(remainingSeeds).toBe(MAX_ACCESS_LOG_ROWS - ACCESS_LOG_PRUNE_INTERVAL);
    // The oldest seeded row is gone, the newest seeded row is still there.
    expect(
      inner(db).prepare("SELECT id FROM access_log WHERE id = 'seed-0'").get(),
    ).toBeUndefined();
    expect(
      inner(db)
        .prepare('SELECT id FROM access_log WHERE id = ?')
        .get(`seed-${MAX_ACCESS_LOG_ROWS - 1}`),
    ).toBeDefined();
  });

  it('leaves a normally sized log untouched', () => {
    for (let i = 0; i < ACCESS_LOG_PRUNE_INTERVAL + 5; i++) {
      db.logAccess(stashId, 'ui', 'read');
    }
    expect(accessLogCount(db)).toBe(ACCESS_LOG_PRUNE_INTERVAL + 5);
    expect(db.getAccessLog(stashId, 10)).toHaveLength(10);
  });
});
