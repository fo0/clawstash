import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionStore } from '../session-store';

/**
 * Characterization tests for SessionStore (Round 1/3 — refs #129).
 *
 * The store was extracted from ClawStashDB. These tests pin the
 * behaviour the password-login flow and the singleton's hourly
 * cleanup interval depend on:
 *
 * - Token format
 * - hours = 0 -> unlimited (NULL expires_at)
 * - Lazy delete on validate when expiry is in the past
 * - cleanExpiredSessions only removes rows with expires_at IN past
 */
function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE admin_sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT
  );`);
  return db;
}

describe('SessionStore', () => {
  let db: Database.Database;
  let store: SessionStore;

  beforeEach(() => {
    db = makeDb();
    store = new SessionStore(db);
  });

  it('createAdminSession returns csa_-prefixed hex token', () => {
    const r = store.createAdminSession(24);
    expect(r.token).toMatch(/^csa_[0-9a-f]{48}$/);
    expect(r.expiresAt).toBeTruthy();
  });

  it('hours=0 yields unlimited (null expiresAt)', () => {
    const r = store.createAdminSession(0);
    expect(r.expiresAt).toBeNull();
    // Persisted as NULL, not the string "null"
    const row = db.prepare('SELECT expires_at FROM admin_sessions').get() as {
      expires_at: string | null;
    };
    expect(row.expires_at).toBeNull();
  });

  it('createAdminSession with positive hours sets expiry roughly hours into future', () => {
    const before = Date.now();
    const r = store.createAdminSession(2);
    const after = Date.now();
    expect(r.expiresAt).not.toBeNull();
    const expiry = new Date(r.expiresAt as string).getTime();
    // Allow a 5-second window for clock jitter
    expect(expiry).toBeGreaterThanOrEqual(before + 2 * 60 * 60 * 1000 - 5000);
    expect(expiry).toBeLessThanOrEqual(after + 2 * 60 * 60 * 1000 + 5000);
  });

  it('validateAdminSession round-trips a fresh session', () => {
    const { token } = store.createAdminSession(1);
    const v = store.validateAdminSession(token);
    expect(v.valid).toBe(true);
  });

  it('validateAdminSession rejects unknown token', () => {
    expect(store.validateAdminSession('csa_deadbeef').valid).toBe(false);
  });

  it('validateAdminSession deletes and rejects expired sessions', () => {
    const { token } = store.createAdminSession(24);
    // Force expiry into the past
    db.prepare('UPDATE admin_sessions SET expires_at = ?').run('2020-01-01T00:00:00.000Z');
    expect(store.validateAdminSession(token).valid).toBe(false);
    // Side effect: row was deleted by the validator (lazy cleanup)
    const count = db.prepare('SELECT COUNT(*) AS c FROM admin_sessions').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('validateAdminSession does NOT delete unlimited (NULL expiry) sessions', () => {
    const { token } = store.createAdminSession(0);
    expect(store.validateAdminSession(token).valid).toBe(true);
    const count = db.prepare('SELECT COUNT(*) AS c FROM admin_sessions').get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('deleteAdminSession returns true for known token, false for unknown', () => {
    const { token } = store.createAdminSession(24);
    expect(store.deleteAdminSession(token)).toBe(true);
    expect(store.deleteAdminSession(token)).toBe(false);
  });

  it('cleanExpiredSessions removes only past-expired rows', () => {
    const { token: a } = store.createAdminSession(24);
    const { token: b } = store.createAdminSession(0); // unlimited

    // Force a's expiry into the past, leave b alone (NULL)
    db.prepare('UPDATE admin_sessions SET expires_at = ? WHERE expires_at IS NOT NULL').run(
      '2020-01-01T00:00:00.000Z',
    );

    expect(store.cleanExpiredSessions()).toBe(1);
    expect(store.validateAdminSession(b).valid).toBe(true);
    expect(store.validateAdminSession(a).valid).toBe(false);
  });

  it('cleanExpiredSessions returns 0 when no sessions are expired', () => {
    store.createAdminSession(24);
    store.createAdminSession(0);
    expect(store.cleanExpiredSessions()).toBe(0);
  });
});
