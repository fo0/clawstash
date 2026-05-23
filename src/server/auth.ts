import { NextRequest } from 'next/server';
import type { ClawStashDB, TokenScope } from './db';

export interface AuthResult {
  authenticated: boolean;
  source: 'admin_session' | 'api_token' | 'open';
  scopes: TokenScope[];
  tokenId?: string;
  expiresAt?: string | null;
}

const ADMIN_PASSWORD = () => process.env.ADMIN_PASSWORD || '';
const ADMIN_SESSION_HOURS = () => {
  const val = process.env.ADMIN_SESSION_HOURS;
  if (val === undefined || val === '') return 24;
  const num = parseFloat(val);
  // 0 means "unlimited" (documented). Treat NaN, negatives, and infinities as
  // misconfiguration and fall back to the safe 24h default rather than
  // silently granting a never-expiring session. Without this guard,
  // ADMIN_SESSION_HOURS=-5 produces createAdminSession(hours <= 0 → no
  // expires_at), i.e. the same behaviour as the explicit "0 = unlimited"
  // opt-in, which is almost certainly not what the operator intended.
  if (!Number.isFinite(num) || num < 0) return 24;
  return num;
};

export { ADMIN_PASSWORD, ADMIN_SESSION_HOURS };

/**
 * Extract Bearer token from request (header or query parameter).
 *
 * Tokens are trimmed defensively before being returned. `cs_` / `csa_`
 * tokens never contain whitespace, but a stray space (e.g. from a copy-paste
 * or a misbehaving HTTP client) should not flip a valid token into a 401.
 * Empty strings after trimming are treated as "no token".
 */
export function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.substring(7).trim();
    return token.length > 0 ? token : null;
  }
  const queryToken = req.nextUrl.searchParams.get('token');
  if (queryToken) {
    const token = queryToken.trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

/**
 * Validate a token against all auth sources.
 * Returns authentication result with source and scopes.
 */
export function validateAuth(db: ClawStashDB, token: string): AuthResult {
  // Check admin session token (csa_* prefix)
  if (token.startsWith('csa_')) {
    const session = db.validateAdminSession(token);
    if (session.valid) {
      return {
        authenticated: true,
        source: 'admin_session',
        scopes: ['read', 'write', 'admin', 'mcp'],
        expiresAt: session.expiresAt ?? null,
      };
    }
    return { authenticated: false, source: 'admin_session', scopes: [] };
  }

  // Check API token (cs_* prefix)
  if (token.startsWith('cs_')) {
    const validation = db.validateApiToken(token);
    if (validation.valid) {
      return {
        authenticated: true,
        source: 'api_token',
        scopes: validation.scopes,
        tokenId: validation.tokenId,
      };
    }
    return { authenticated: false, source: 'api_token', scopes: [] };
  }

  return { authenticated: false, source: 'api_token', scopes: [] };
}

/**
 * Check if auth is required (ADMIN_PASSWORD is set).
 */
export function isAuthEnabled(): boolean {
  return !!ADMIN_PASSWORD();
}

/**
 * Check if a token has a specific scope.
 * Returns true if no ADMIN_PASSWORD is set (open mode) or if token has the required scope.
 */
export function requireScopeAuth(
  db: ClawStashDB,
  req: NextRequest,
  scope: TokenScope,
): AuthResult | null {
  if (!isAuthEnabled()) {
    return { authenticated: true, source: 'open', scopes: ['read', 'write', 'admin', 'mcp'] };
  }

  const token = extractToken(req);
  if (!token) return null;

  const auth = validateAuth(db, token);
  if (!auth.authenticated) return null;

  // Admin scope implies all other scopes
  if (auth.scopes.includes('admin')) return auth;

  // Write scope implies read
  if (scope === 'read' && auth.scopes.includes('write')) return auth;

  if (auth.scopes.includes(scope)) return auth;

  return null;
}

/**
 * Check if a token has admin access.
 *
 * Trace-equivalent to `requireScopeAuth(db, req, 'admin')`: both short-circuit
 * the same way for open-mode, missing token, non-admin scope, and admin scope.
 * Kept as a named helper so admin-only call sites read clearly.
 */
export function requireAdminAuth(db: ClawStashDB, req: NextRequest): AuthResult | null {
  return requireScopeAuth(db, req, 'admin');
}
