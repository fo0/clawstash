import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { TokenStore } from '../token-store';

/**
 * Characterization tests for TokenStore (Round 1/3 — refs #129).
 *
 * The store was extracted from ClawStashDB. These tests pin the
 * behaviour that 25+ existing call sites in route handlers and
 * the auth middleware depend on:
 *
 * - Token format / prefix
 * - Round-trip validation
 * - Defence against tampered or corrupted scope rows
 * - That the full token never leaks into a list response
 */
function makeDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE api_tokens (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL DEFAULT '',
    token_hash TEXT NOT NULL UNIQUE,
    token_prefix TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT '["read"]',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`);
  return db;
}

describe('TokenStore', () => {
  let db: Database.Database;
  let store: TokenStore;

  beforeEach(() => {
    db = makeDb();
    store = new TokenStore(db);
  });

  it('createApiToken returns cs_-prefixed hex token', () => {
    const r = store.createApiToken('test', ['read']);
    expect(r.token).toMatch(/^cs_[0-9a-f]{48}$/);
    expect(r.label).toBe('test');
    expect(r.scopes).toEqual(['read']);
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('createApiToken accepts empty label', () => {
    const r = store.createApiToken('', ['read']);
    expect(r.label).toBe('');
  });

  it('validateApiToken accepts the just-issued raw token', () => {
    const { token, id } = store.createApiToken('t', ['write']);
    const v = store.validateApiToken(token);
    expect(v).toEqual({ valid: true, scopes: ['write'], tokenId: id });
  });

  it('validateApiToken rejects tampered token', () => {
    const { token } = store.createApiToken('t', ['read']);
    expect(store.validateApiToken(token + 'x')).toEqual({ valid: false, scopes: [] });
  });

  it('validateApiToken rejects unknown token', () => {
    expect(store.validateApiToken('cs_deadbeef')).toEqual({ valid: false, scopes: [] });
  });

  it('listApiTokens returns prefix-only, never the full token', () => {
    const { token } = store.createApiToken('t', ['read']);
    const list = store.listApiTokens();
    expect(list).toHaveLength(1);
    expect(list[0].tokenPrefix).toBe(token.substring(0, 7));
    // Defence-in-depth: full token never appears in the listing payload
    expect(JSON.stringify(list)).not.toContain(token);
  });

  it('listApiTokens returns rows ordered by created_at DESC', () => {
    // Insert with explicit timestamps to control ordering deterministically
    db.prepare(`INSERT INTO api_tokens (id, label, token_hash, token_prefix, scopes, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`).run('a', 'old', 'h1', 'cs_old', '["read"]', '2020-01-01T00:00:00Z');
    db.prepare(`INSERT INTO api_tokens (id, label, token_hash, token_prefix, scopes, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`).run('b', 'new', 'h2', 'cs_new', '["read"]', '2026-01-01T00:00:00Z');
    const list = store.listApiTokens();
    expect(list.map(t => t.label)).toEqual(['new', 'old']);
  });

  it('deleteApiToken returns true for known id and false for unknown', () => {
    const { id } = store.createApiToken('t', ['read']);
    expect(store.deleteApiToken(id)).toBe(true);
    expect(store.deleteApiToken(id)).toBe(false);
  });

  it('safeParseScopes filters unknown values from corrupted rows', () => {
    db.prepare(`INSERT INTO api_tokens (id, label, token_hash, token_prefix, scopes, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run('x', 'corrupt', 'deadbeef', 'cs_dead', '["read","wat",42,"admin"]', '2026-01-01T00:00:00Z');
    const list = store.listApiTokens();
    expect(list[0].scopes).toEqual(['read', 'admin']);
  });

  it('safeParseScopes returns [] for invalid JSON', () => {
    db.prepare(`INSERT INTO api_tokens (id, label, token_hash, token_prefix, scopes, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run('y', 'broken', 'beefdead', 'cs_beef', '{not json', '2026-01-01T00:00:00Z');
    const list = store.listApiTokens();
    expect(list[0].scopes).toEqual([]);
  });

  it('safeParseScopes returns [] for non-array JSON', () => {
    db.prepare(`INSERT INTO api_tokens (id, label, token_hash, token_prefix, scopes, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run('z', 'object', 'abcdef00', 'cs_obj', '{"read":true}', '2026-01-01T00:00:00Z');
    const list = store.listApiTokens();
    expect(list[0].scopes).toEqual([]);
  });

  it('validateApiToken applies the same scope filter as listApiTokens', () => {
    // Manually insert a token with a known raw value so we can validate it
    // and confirm scope filtering matches list behaviour.
    const crypto = require('crypto') as typeof import('crypto');
    const raw = 'cs_' + 'a'.repeat(48);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    db.prepare(`INSERT INTO api_tokens (id, label, token_hash, token_prefix, scopes, created_at)
                VALUES (?, ?, ?, ?, ?, ?)`)
      .run('m', 'mix', hash, raw.substring(0, 7), '["read","bogus","mcp"]', '2026-01-01T00:00:00Z');
    const v = store.validateApiToken(raw);
    expect(v).toEqual({ valid: true, scopes: ['read', 'mcp'], tokenId: 'm' });
  });
});
