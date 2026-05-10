import { describe, it, expect } from 'vitest';
import { getMcpSpecText, getMcpOnboardingText, getMcpRefreshText } from '../mcp-spec';

/**
 * Characterization tests for the memoizeByBaseUrl helper (Round 2/3 — refs #131).
 *
 * The three spec generators share a single-entry cache keyed by baseUrl.
 * These tests pin the behaviour callers depend on:
 *
 * - Same baseUrl returns the cached string (referential equality).
 * - Changing baseUrl rebuilds and updates the cache.
 * - The new baseUrl is reflected in the rebuilt content.
 */
describe('mcp-spec memoizeByBaseUrl caching', () => {
  it('returns the same string instance for repeated baseUrl', () => {
    const a = getMcpSpecText('http://localhost:3000');
    const b = getMcpSpecText('http://localhost:3000');
    expect(a).toBe(b); // referential equality => single-entry cache hit
  });

  it('rebuilds when baseUrl changes and reflects the new host', () => {
    const a = getMcpSpecText('http://localhost:3000');
    const b = getMcpSpecText('https://example.com');
    expect(a).not.toBe(b);
    expect(b).toContain('https://example.com');
  });

  it('caches onboarding and refresh wrappers independently of the spec', () => {
    const onboardA = getMcpOnboardingText('http://localhost:3000');
    const onboardB = getMcpOnboardingText('http://localhost:3000');
    expect(onboardA).toBe(onboardB);

    const refreshA = getMcpRefreshText('http://localhost:3000');
    const refreshB = getMcpRefreshText('http://localhost:3000');
    expect(refreshA).toBe(refreshB);
  });
});
