import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createDeviceSession,
  getDeviceSession,
  deleteDeviceSession,
  type DeviceSession,
} from '../device-sessions';

/**
 * Unit tests for the in-memory device-flow session store (refs #108, #111).
 *
 * The store is globalThis-backed (HMR-safe), so each test resets the shared
 * map first. These tests pin the behaviour the GitHub OAuth device-flow login
 * depends on:
 *
 * - Expiry purge runs on every create/get and drops only past-deadline rows.
 * - MAX_SESSIONS (10) is enforced by evicting the oldest insertion first.
 * - get/delete semantics (null for missing, idempotent delete).
 */

const globalForSessions = globalThis as unknown as {
  __clawstashDeviceSessions?: Map<string, DeviceSession>;
};

function resetStore(): void {
  globalForSessions.__clawstashDeviceSessions = new Map();
}

function makeInput(overrides: Partial<Omit<DeviceSession, 'id' | 'lastPollAt'>> = {}) {
  return {
    clientId: 'Iv1.client',
    deviceCode: 'device-code',
    interval: 5,
    expiresAt: Date.now() + 15 * 60_000,
    ...overrides,
  };
}

describe('device-sessions store', () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStore();
  });

  it('createDeviceSession assigns a UUID id, lastPollAt=0, and preserves input', () => {
    const session = createDeviceSession(
      makeInput({ clientId: 'Iv1.abc', deviceCode: 'secret', interval: 7 }),
    );

    expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(session.lastPollAt).toBe(0);
    expect(session.clientId).toBe('Iv1.abc');
    expect(session.deviceCode).toBe('secret');
    expect(session.interval).toBe(7);
  });

  it('getDeviceSession returns the stored session, null for unknown ids', () => {
    const session = createDeviceSession(makeInput());

    expect(getDeviceSession(session.id)).toEqual(session);
    expect(getDeviceSession('does-not-exist')).toBeNull();
  });

  it('deleteDeviceSession removes the row and is idempotent', () => {
    const session = createDeviceSession(makeInput());

    deleteDeviceSession(session.id);
    expect(getDeviceSession(session.id)).toBeNull();
    // Second delete on a missing id must not throw.
    expect(() => deleteDeviceSession(session.id)).not.toThrow();
  });

  it('purges expired sessions on access (getDeviceSession)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T00:00:00Z'));

    const session = createDeviceSession(makeInput({ expiresAt: Date.now() + 60_000 }));
    expect(getDeviceSession(session.id)).not.toBeNull();

    // Advance past the deadline; the next access must purge it.
    vi.advanceTimersByTime(61_000);
    expect(getDeviceSession(session.id)).toBeNull();
  });

  it('purges expired sessions on create as well', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T00:00:00Z'));

    const stale = createDeviceSession(makeInput({ expiresAt: Date.now() + 1_000 }));
    vi.advanceTimersByTime(2_000);

    // Creating a fresh session triggers purgeExpired() and drops the stale one.
    createDeviceSession(makeInput({ expiresAt: Date.now() + 60_000 }));
    expect(getDeviceSession(stale.id)).toBeNull();
  });

  it('treats a session expiring exactly at now as expired (expiresAt <= now)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T00:00:00Z'));

    const session = createDeviceSession(makeInput({ expiresAt: Date.now() }));
    // expiresAt === now satisfies `expiresAt <= now`, so it is purged on access.
    expect(getDeviceSession(session.id)).toBeNull();
  });

  it('enforces MAX_SESSIONS by evicting the oldest insertion first', () => {
    const created: DeviceSession[] = [];
    for (let i = 0; i < 10; i++) {
      created.push(createDeviceSession(makeInput({ deviceCode: `code-${i}` })));
    }
    // All 10 present at the cap.
    for (const s of created) {
      expect(getDeviceSession(s.id)).not.toBeNull();
    }

    // The 11th create must evict the oldest (insertion-order = Map key order).
    const overflow = createDeviceSession(makeInput({ deviceCode: 'code-10' }));

    expect(getDeviceSession(created[0]!.id)).toBeNull();
    expect(getDeviceSession(created[1]!.id)).not.toBeNull();
    expect(getDeviceSession(overflow.id)).not.toBeNull();
  });
});
