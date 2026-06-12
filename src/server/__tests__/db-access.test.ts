import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { assertDatabaseWritable } from '../db-access-check';
import { ClawStashDB } from '../db';

/**
 * Fail-fast writability check (Docker bind-mount permissions, refs the
 * SQLITE_READONLY login failure): SQLite silently opens write-protected
 * files read-only, so the constructor must reject them with an actionable
 * error instead of letting later writes fail cryptically.
 */

// root (and Windows) bypass POSIX permission bits, so the negative cases
// only run as an unprivileged user — which is what CI uses.
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

describe.skipIf(isRoot || process.platform === 'win32')('assertDatabaseWritable', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'clawstash-access-'));
  });

  afterEach(() => {
    fs.chmodSync(tmp, 0o755);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('throws an actionable error when the directory is not writable', () => {
    fs.chmodSync(tmp, 0o555);
    expect(() => assertDatabaseWritable(tmp, path.join(tmp, 'db.sqlite'))).toThrow(
      /directory '.*' is not writable[\s\S]*chown -R/,
    );
  });

  it('throws when the database file itself is read-only', () => {
    const dbPath = path.join(tmp, 'db.sqlite');
    fs.writeFileSync(dbPath, '');
    fs.chmodSync(dbPath, 0o444);
    expect(() => assertDatabaseWritable(tmp, dbPath)).toThrow(
      /file '.*db\.sqlite' is not writable/,
    );
  });

  it('throws when a stale WAL sidecar file is read-only', () => {
    const dbPath = path.join(tmp, 'db.sqlite');
    fs.writeFileSync(dbPath, '');
    fs.writeFileSync(`${dbPath}-wal`, '');
    fs.chmodSync(`${dbPath}-wal`, 0o444);
    expect(() => assertDatabaseWritable(tmp, dbPath)).toThrow(/db\.sqlite-wal' is not writable/);
  });

  it('passes for a writable directory without a database file', () => {
    expect(() => assertDatabaseWritable(tmp, path.join(tmp, 'db.sqlite'))).not.toThrow();
  });

  it('surfaces the error from the ClawStashDB constructor', () => {
    fs.chmodSync(tmp, 0o555);
    expect(() => new ClawStashDB(path.join(tmp, 'db.sqlite'))).toThrow(/ClawStash cannot start/);
  });
});

it('in-memory databases skip the writability check', () => {
  // The rest of the suite relies on ClawStashDB(':memory:') staying exempt.
  const db = new ClawStashDB(':memory:');
  db.close();
});
