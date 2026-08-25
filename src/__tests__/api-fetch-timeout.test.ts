import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  ApiTimeoutError,
  DEFAULT_FETCH_TIMEOUT_MS,
  fetchWithTimeout,
  resolveFetchTimeoutMs,
} from '../api';

/**
 * Outbound request deadline for the frontend API client (refs #535).
 *
 * `fetch` has no built-in timeout, so a server that accepts the connection and
 * then goes silent used to hang the UI forever. These tests pin the two halves
 * of the fix: how the env var is parsed, and that the deadline surfaces as a
 * typed `ApiTimeoutError` instead of a raw abort.
 */

/** A fetch stub that never answers but honours the abort signal it is given. */
function hangingFetch(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      // `AbortSignal.reason` is `any`; it is a DOMException here (TimeoutError
      // for the deadline, AbortError for a caller abort) — both are Errors.
      const reason = (): Error => signal.reason as Error;
      if (signal.aborted) {
        reject(reason());
        return;
      }
      signal.addEventListener('abort', () => reject(reason()));
    })) as unknown as typeof fetch;
}

/** A fetch stub that answers immediately and records the init it received. */
function instantFetch(seen: RequestInit[]): typeof fetch {
  return ((_url: string, init?: RequestInit) => {
    seen.push(init ?? {});
    return Promise.resolve(new Response('ok', { status: 200 }));
  }) as unknown as typeof fetch;
}

describe('resolveFetchTimeoutMs', () => {
  it('falls back to the default for unset and blank values', () => {
    expect(resolveFetchTimeoutMs(undefined)).toBe(DEFAULT_FETCH_TIMEOUT_MS);
    expect(resolveFetchTimeoutMs('')).toBe(DEFAULT_FETCH_TIMEOUT_MS);
    expect(resolveFetchTimeoutMs('   ')).toBe(DEFAULT_FETCH_TIMEOUT_MS);
  });

  it('accepts 0 as "no timeout"', () => {
    expect(resolveFetchTimeoutMs('0')).toBe(0);
  });

  it('accepts any other non-negative integer', () => {
    expect(resolveFetchTimeoutMs('250')).toBe(250);
    expect(resolveFetchTimeoutMs('30000')).toBe(30000);
  });

  it('falls back to the default for negative, fractional and non-numeric values', () => {
    expect(resolveFetchTimeoutMs('-1')).toBe(DEFAULT_FETCH_TIMEOUT_MS);
    expect(resolveFetchTimeoutMs('1.5')).toBe(DEFAULT_FETCH_TIMEOUT_MS);
    expect(resolveFetchTimeoutMs('soon')).toBe(DEFAULT_FETCH_TIMEOUT_MS);
  });

  it('defaults to a few seconds, not minutes', () => {
    expect(DEFAULT_FETCH_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DEFAULT_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe('fetchWithTimeout', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects with ApiTimeoutError when the server never answers', async () => {
    vi.stubGlobal('fetch', hangingFetch());

    await expect(fetchWithTimeout('/api/stashes', {}, 20)).rejects.toBeInstanceOf(ApiTimeoutError);
  });

  it('carries the url and the timeout on the error', async () => {
    vi.stubGlobal('fetch', hangingFetch());

    const err = await fetchWithTimeout('/api/stashes', {}, 20).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiTimeoutError);
    const timeoutError = err as ApiTimeoutError;
    expect(timeoutError.name).toBe('ApiTimeoutError');
    expect(timeoutError.url).toBe('/api/stashes');
    expect(timeoutError.timeoutMs).toBe(20);
    expect(timeoutError.message).toContain('timed out');
  });

  it('returns the response untouched when the server answers in time', async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal('fetch', instantFetch(seen));

    const res = await fetchWithTimeout('/api/version', { method: 'GET' }, 1000);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
    expect(seen[0].method).toBe('GET');
    expect(seen[0].signal).toBeInstanceOf(AbortSignal);
  });

  it('attaches no signal at all when the timeout is disabled with 0', async () => {
    const seen: RequestInit[] = [];
    vi.stubGlobal('fetch', instantFetch(seen));

    await fetchWithTimeout('/api/version', { method: 'GET' }, 0);
    expect(seen[0].signal).toBeUndefined();
  });

  it('never times out a request when the timeout is disabled with 0', async () => {
    vi.stubGlobal('fetch', hangingFetch());

    const settled = await Promise.race([
      fetchWithTimeout('/api/stashes', {}, 0).then(
        () => 'resolved',
        () => 'rejected',
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('still pending'), 60)),
    ]);
    expect(settled).toBe('still pending');
  });

  it('lets a caller-supplied abort through as itself, not as a timeout', async () => {
    vi.stubGlobal('fetch', hangingFetch());

    const controller = new AbortController();
    const pending = fetchWithTimeout('/api/stashes', { signal: controller.signal }, 5_000);
    controller.abort();

    const err = await pending.catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ApiTimeoutError);
    expect((err as Error).name).toBe('AbortError');
  });
});
