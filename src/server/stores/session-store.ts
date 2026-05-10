import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { hashToken } from './_token-hash';

/**
 * Admin session CRUD + validation + expiry cleanup. Extracted from
 * ClawStashDB (Round 1/3 — refs #129) so the password-login session
 * lifecycle has its own focused, testable module. Behaviour is
 * bit-for-bit identical to the previous inlined implementation:
 *
 * - Sessions are issued as `csa_` + 48 hex chars (24 random bytes).
 * - `hours = 0` means unlimited (`expires_at` = NULL).
 * - `validateAdminSession()` lazily deletes a session whose `expires_at`
 *   is in the past, then reports `valid: false` for that call.
 * - `cleanExpiredSessions()` is the periodic sweeper called by the DB
 *   singleton's hourly interval.
 *
 * ClawStashDB keeps its public 4 session methods as one-line delegators
 * to this store, so auth.ts and the singleton path do not change.
 */
export class SessionStore {
  constructor(private readonly db: Database.Database) {}

  createAdminSession(hours: number): { token: string; expiresAt: string | null } {
    const id = uuidv4();
    const now = new Date();
    const rawToken = `csa_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = hashToken(rawToken);
    let expiresAt: string | null = null;
    if (hours > 0) {
      expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
    }

    this.db.prepare(`
      INSERT INTO admin_sessions (id, token_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(id, tokenHash, now.toISOString(), expiresAt);

    return { token: rawToken, expiresAt };
  }

  validateAdminSession(token: string): { valid: boolean; expiresAt?: string | null } {
    const tokenHash = hashToken(token);
    const row = this.db.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ?').get(tokenHash) as { expires_at: string | null } | undefined;
    if (!row) return { valid: false };
    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      // Expired - clean up
      this.db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
      return { valid: false };
    }
    return { valid: true, expiresAt: row.expires_at };
  }

  deleteAdminSession(token: string): boolean {
    const tokenHash = hashToken(token);
    const result = this.db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(tokenHash);
    return result.changes > 0;
  }

  cleanExpiredSessions(): number {
    const now = new Date().toISOString();
    const result = this.db.prepare("DELETE FROM admin_sessions WHERE expires_at IS NOT NULL AND expires_at < ?").run(now);
    return result.changes;
  }
}
