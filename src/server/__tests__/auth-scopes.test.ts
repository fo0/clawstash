import { describe, it, expect } from 'vitest';
import { hasScope, allScopes } from '../auth';
import type { TokenScope } from '../db';

/**
 * The scope ladder, pinned as a truth table.
 *
 * `hasScope()` is the single authorization decision in the app: the REST
 * routes reach it through `requireScopeAuth()`, and the MCP server calls it on
 * every `tools/call`. Before it was extracted the same three lines lived
 * inline in `requireScopeAuth` with no test at all, so the extraction rested
 * on equivalence by inspection. This table is that equivalence, written down.
 *
 * Expectations are spelled out literally, never computed — a table that
 * re-implements the ladder would agree with a wrong implementation.
 *
 * The rules being pinned:
 * - `admin` implies every scope.
 * - `write` implies `read` (but not the reverse).
 * - `mcp` is a TRANSPORT gate outside the ladder: it satisfies neither `read`
 *   nor `write`, and nothing but `admin` or `mcp` itself satisfies `mcp`.
 */

type Case = {
  scopes: TokenScope[];
  read: boolean;
  write: boolean;
  admin: boolean;
  mcp: boolean;
};

const TRUTH_TABLE: Case[] = [
  // No scopes at all — a token whose scope list came back empty.
  { scopes: [], read: false, write: false, admin: false, mcp: false },

  // Single scopes.
  { scopes: ['read'], read: true, write: false, admin: false, mcp: false },
  { scopes: ['write'], read: true, write: true, admin: false, mcp: false },
  { scopes: ['admin'], read: true, write: true, admin: true, mcp: true },
  // The escalation this whole change is about: mcp alone grants nothing.
  { scopes: ['mcp'], read: false, write: false, admin: false, mcp: true },

  // Pairs an MCP client realistically holds.
  { scopes: ['read', 'mcp'], read: true, write: false, admin: false, mcp: true },
  { scopes: ['write', 'mcp'], read: true, write: true, admin: false, mcp: true },
  { scopes: ['admin', 'mcp'], read: true, write: true, admin: true, mcp: true },
  { scopes: ['read', 'write'], read: true, write: true, admin: false, mcp: false },

  // The combination the onboarding guide recommends.
  { scopes: ['read', 'write', 'mcp'], read: true, write: true, admin: false, mcp: true },

  // Everything (admin sessions and open mode resolve to this).
  { scopes: ['read', 'write', 'admin', 'mcp'], read: true, write: true, admin: true, mcp: true },
];

describe('hasScope — the scope ladder', () => {
  for (const testCase of TRUTH_TABLE) {
    const label = testCase.scopes.length > 0 ? testCase.scopes.join('+') : '(none)';
    it(`[${label}] satisfies exactly the expected scopes`, () => {
      expect(hasScope(testCase.scopes, 'read'), `${label} -> read`).toBe(testCase.read);
      expect(hasScope(testCase.scopes, 'write'), `${label} -> write`).toBe(testCase.write);
      expect(hasScope(testCase.scopes, 'admin'), `${label} -> admin`).toBe(testCase.admin);
      expect(hasScope(testCase.scopes, 'mcp'), `${label} -> mcp`).toBe(testCase.mcp);
    });
  }

  it('never lets mcp stand in for a data scope', () => {
    expect(hasScope(['mcp'], 'read')).toBe(false);
    expect(hasScope(['mcp'], 'write')).toBe(false);
  });

  it('lets write stand in for read, but not read for write', () => {
    expect(hasScope(['write'], 'read')).toBe(true);
    expect(hasScope(['read'], 'write')).toBe(false);
  });

  it('lets admin stand in for everything, including mcp', () => {
    for (const scope of ['read', 'write', 'admin', 'mcp'] as TokenScope[]) {
      expect(hasScope(['admin'], scope), `admin -> ${scope}`).toBe(true);
    }
  });

  it('does not mutate the scope list it is given', () => {
    const scopes: TokenScope[] = ['read', 'mcp'];
    hasScope(scopes, 'write');
    expect(scopes).toEqual(['read', 'mcp']);
  });
});

describe('allScopes', () => {
  it('returns the full scope set', () => {
    expect(allScopes().sort()).toEqual(['admin', 'mcp', 'read', 'write']);
  });

  it('returns a fresh array so callers cannot poison the shared constant', () => {
    const first = allScopes();
    first.length = 0;
    expect(allScopes().sort()).toEqual(['admin', 'mcp', 'read', 'write']);
  });
});
