import type Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import type { TokenScope, ApiTokenListItem } from '../db-types';
import { hashToken } from './_token-hash';

// Defensive parser for `api_tokens.scopes` rows. Corruption of this column
// (manual SQL edit, partial migration, etc.) must not 500 out the token
// listing or auth check — the token simply ends up with an empty (or
// partially-valid) scope set and falls back to "no access". Mirrors the
// pattern of ClawStashDB.safeParseTags / safeParseMetadata.
const VALID_SCOPES: readonly TokenScope[] = ['read', 'write', 'admin', 'mcp'];

function safeParseScopes(raw: unknown): TokenScope[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is TokenScope => typeof s === 'string' && (VALID_SCOPES as readonly string[]).includes(s),
    );
  } catch {
    return [];
  }
}

/**
 * API token CRUD + validation. Extracted from ClawStashDB (Round 1/3 —
 * refs #129) so the auth-facing surface has its own focused, testable
 * module. The behaviour is bit-for-bit identical to the previous
 * inlined implementation:
 *
 * - Tokens are issued as `cs_` + 48 hex chars (24 random bytes).
 * - Only the SHA-256 hash + a 7-char display prefix are stored.
 * - `validateApiToken(raw)` succeeds iff the SHA-256 of the raw value
 *   matches a row, returning the (defensively parsed) scope list.
 *
 * ClawStashDB keeps its public 4 token methods as one-line delegators
 * to this store, so the 25+ existing call sites do not change.
 */
export class TokenStore {
  constructor(private readonly db: Database.Database) {}

  createApiToken(label: string, scopes: TokenScope[]): { id: string; token: string; label: string; scopes: TokenScope[] } {
    const id = uuidv4();
    const now = new Date().toISOString();
    const rawToken = `cs_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = hashToken(rawToken);
    const tokenPrefix = rawToken.substring(0, 7);

    this.db.prepare(`
      INSERT INTO api_tokens (id, label, token_hash, token_prefix, scopes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, label || '', tokenHash, tokenPrefix, JSON.stringify(scopes), now);

    return { id, token: rawToken, label: label || '', scopes };
  }

  listApiTokens(): ApiTokenListItem[] {
    const rows = this.db.prepare('SELECT * FROM api_tokens ORDER BY created_at DESC').all() as {
      id: string; label: string; token_prefix: string; scopes: string; created_at: string;
    }[];
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      tokenPrefix: row.token_prefix,
      scopes: safeParseScopes(row.scopes),
      createdAt: row.created_at,
    }));
  }

  deleteApiToken(id: string): boolean {
    const result = this.db.prepare('DELETE FROM api_tokens WHERE id = ?').run(id);
    return result.changes > 0;
  }

  validateApiToken(token: string): { valid: boolean; scopes: TokenScope[]; tokenId?: string } {
    const tokenHash = hashToken(token);
    const row = this.db.prepare('SELECT id, scopes FROM api_tokens WHERE token_hash = ?').get(tokenHash) as { id: string; scopes: string } | undefined;
    if (!row) return { valid: false, scopes: [] };
    return { valid: true, scopes: safeParseScopes(row.scopes), tokenId: row.id };
  }
}
