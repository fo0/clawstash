import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processDevicePoll, type DevicePollDeps } from '../device-poll';
import type { DeviceSession } from '../device-sessions';

/**
 * Unit tests for the extracted device-flow poll logic (refs #108, #111).
 *
 * Previously this orchestration lived inline in the route handler and the repo
 * has no route-handler test convention, so it was uncovered. The logic is now
 * a pure function with injected side effects; these tests pin:
 *
 * - server-side minimum-interval enforcement (no GitHub call before interval),
 * - the `slow_down` interval bump,
 * - the consumed-device-code happy path (token stored BEFORE login lookup),
 * - the account-lookup-failure fallback to `login: 'unknown'`,
 * - terminal error → session deleted, no token stored,
 * - transient exception → `pending`, session kept alive.
 */

const FIXED_NOW = 1_000_000;

function makeSession(overrides: Partial<DeviceSession> = {}): DeviceSession {
  return {
    id: 'sess-1',
    clientId: 'Iv1.client',
    deviceCode: 'device-code',
    interval: 5,
    expiresAt: FIXED_NOW + 15 * 60_000,
    lastPollAt: 0,
    ...overrides,
  };
}

function makeDeps(overrides: Partial<DevicePollDeps> = {}): DevicePollDeps {
  return {
    pollDeviceFlow: vi.fn(async () => ({ status: 'pending', interval: 0 }) as const),
    getAuthenticatedUser: vi.fn(async () => ({ login: 'octocat' })),
    storeToken: vi.fn(),
    deleteSession: vi.fn(),
    notifyChanged: vi.fn(),
    ...overrides,
  };
}

describe('processDevicePoll', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns pending without calling GitHub when polled before the interval elapses', async () => {
    // lastPollAt is "now"; interval is 5s, so a poll at +1s is too soon.
    const session = makeSession({ lastPollAt: FIXED_NOW });
    const deps = makeDeps();

    const outcome = await processDevicePoll(session, deps, () => FIXED_NOW + 1_000);

    expect(outcome).toEqual({ status: 'pending' });
    expect(deps.pollDeviceFlow).not.toHaveBeenCalled();
    expect(session.lastPollAt).toBe(FIXED_NOW); // unchanged
  });

  it('polls and records lastPollAt once the interval has elapsed', async () => {
    const session = makeSession({ lastPollAt: 0 });
    const deps = makeDeps();

    const outcome = await processDevicePoll(session, deps, () => FIXED_NOW);

    expect(outcome).toEqual({ status: 'pending' });
    expect(deps.pollDeviceFlow).toHaveBeenCalledWith('Iv1.client', 'device-code');
    expect(session.lastPollAt).toBe(FIXED_NOW);
  });

  it('bumps the session interval on slow_down but never lowers it', async () => {
    const session = makeSession({ lastPollAt: 0, interval: 5 });
    const deps = makeDeps({
      pollDeviceFlow: vi.fn(async () => ({ status: 'pending', interval: 10 }) as const),
    });

    await processDevicePoll(session, deps, () => FIXED_NOW);
    expect(session.interval).toBe(10);

    // A later, smaller interval must not shrink it back down.
    session.lastPollAt = 0;
    (deps.pollDeviceFlow as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'pending',
      interval: 7,
    });
    await processDevicePoll(session, deps, () => FIXED_NOW + 20_000);
    expect(session.interval).toBe(10);
  });

  it('stores the token BEFORE resolving the login, then deletes the session and notifies', async () => {
    const order: string[] = [];
    const session = makeSession({ lastPollAt: 0 });
    const deps = makeDeps({
      pollDeviceFlow: vi.fn(async () => ({ status: 'connected', token: 'tok-123' }) as const),
      getAuthenticatedUser: vi.fn(async () => {
        order.push('lookup');
        return { login: 'octocat' };
      }),
      storeToken: vi.fn(() => order.push('store')),
      deleteSession: vi.fn(() => order.push('delete')),
      notifyChanged: vi.fn(() => order.push('notify')),
    });

    const outcome = await processDevicePoll(session, deps, () => FIXED_NOW);

    expect(outcome).toEqual({ status: 'connected', login: 'octocat' });
    expect(deps.storeToken).toHaveBeenCalledWith('tok-123', 'octocat');
    // Token is persisted before the cosmetic login lookup completes its effect.
    expect(order).toEqual(['lookup', 'store', 'delete', 'notify']);
  });

  it('falls back to login "unknown" when the account lookup fails, but still stores the token', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({ lastPollAt: 0 });
    const deps = makeDeps({
      pollDeviceFlow: vi.fn(async () => ({ status: 'connected', token: 'tok-xyz' }) as const),
      getAuthenticatedUser: vi.fn(async () => {
        throw new Error('rate limited');
      }),
    });

    const outcome = await processDevicePoll(session, deps, () => FIXED_NOW);

    expect(outcome).toEqual({ status: 'connected', login: 'unknown' });
    expect(deps.storeToken).toHaveBeenCalledWith('tok-xyz', 'unknown');
    expect(deps.deleteSession).toHaveBeenCalledWith('sess-1');
    expect(deps.notifyChanged).toHaveBeenCalledTimes(1);
  });

  it('deletes the session and returns the error on a terminal poll error', async () => {
    const session = makeSession({ lastPollAt: 0 });
    const deps = makeDeps({
      pollDeviceFlow: vi.fn(async () => ({ status: 'error', error: 'access_denied' }) as const),
    });

    const outcome = await processDevicePoll(session, deps, () => FIXED_NOW);

    expect(outcome).toEqual({ status: 'error', error: 'access_denied' });
    expect(deps.deleteSession).toHaveBeenCalledWith('sess-1');
    expect(deps.storeToken).not.toHaveBeenCalled();
    expect(deps.notifyChanged).not.toHaveBeenCalled();
  });

  it('keeps the session alive and returns pending on a transient upstream failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const session = makeSession({ lastPollAt: 0 });
    const deps = makeDeps({
      pollDeviceFlow: vi.fn(async () => {
        throw new Error('ECONNRESET');
      }),
    });

    const outcome = await processDevicePoll(session, deps, () => FIXED_NOW);

    expect(outcome).toEqual({ status: 'pending' });
    expect(deps.deleteSession).not.toHaveBeenCalled();
    expect(deps.storeToken).not.toHaveBeenCalled();
  });
});
