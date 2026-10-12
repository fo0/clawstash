import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiHttpError, ApiTimeoutError, api, isNotFoundError } from '../api';

/**
 * A non-2xx answer surfaces as a typed `ApiHttpError` carrying the status, so
 * the UI can tell "this stash was deleted elsewhere" (404) apart from a failure
 * worth retrying, without parsing the message.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

describe('ApiHttpError', () => {
  it('carries the status and keeps the server message', async () => {
    stubFetch(404, { error: 'Stash not found' });
    const err = await api.getStash('gone').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect(err).toBeInstanceOf(Error);
    expect((err as ApiHttpError).status).toBe(404);
    expect((err as ApiHttpError).message).toBe('Stash not found');
  });

  it('falls back to the generic status message without an error body', async () => {
    stubFetch(500, {});
    const err = await api.getStash('x').catch((e: unknown) => e);
    expect((err as ApiHttpError).status).toBe(500);
    expect((err as ApiHttpError).message).toMatch(/\(HTTP 500\)$/);
  });
});

describe('isNotFoundError', () => {
  it('is true only for an HTTP 404', () => {
    expect(isNotFoundError(new ApiHttpError('Stash not found', 404))).toBe(true);
    expect(isNotFoundError(new ApiHttpError('boom', 500))).toBe(false);
    expect(isNotFoundError(new ApiHttpError('nope', 403))).toBe(false);
    expect(isNotFoundError(new ApiTimeoutError('/api/stashes/x', 1000))).toBe(false);
    expect(isNotFoundError(new Error('Stash not found'))).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
  });
});
