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
  return isNaN(num) ? 24 : num;
};

export { ADMIN_PASSWORD, ADMIN_SESSION_HOURS };

/**
 * Extract Bearer token from request (header or query parameter).
 */
export function extractToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.substring(7);
  }
  const queryToken = req.nextUrl.searchParams.get('token');
  if (queryToken) {
    return queryToken;
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
 * Check if a token has admin access.
 * Returns true if no ADMIN_PASSWORD is set (open mode) or if token has admin privileges.
 */
export function requireAdminAuth(db: ClawStashDB, req: NextRequest): AuthResult | null {
  if (!isAuthEnabled()) {
    return { authenticated: true, source: 'open', scopes: ['read', 'write', 'admin', 'mcp'] };
  }

  const token = extractToken(req);
  if (!token) return null;

  const auth = validateAuth(db, token);
  if (auth.authenticated && auth.scopes.includes('admin')) {
    return auth;
  }

  return null;
}

/**
 * Check if a token has a specific scope.
 * Returns true if no ADMIN_PASSWORD is set (open mode) or if token has the required scope.
 */
export function requireScopeAuth(db: ClawStashDB, req: NextRequest, scope: TokenScope): AuthResult | null {
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
