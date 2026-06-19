import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createDeviceSession,
  getDeviceSession,
  deleteDeviceSession,
  type DeviceSession,
} from '../device-sessions';

// The store is globalThis-backed (HMR-safe), so isolate every test by wiping
// the shared Map before each run.
const globalForSessions = globalThis as unknown as {
  __clawstashDeviceSessions?: Map<string, DeviceSession>;
};

function resetStore(): void {
  globalForSessions.__clawstashDeviceSessions = new Map();
}

// A small helper to spawn a session with a fixed TTL relative to "now".
function makeInput(
  overrides: Partial<Omit<DeviceSession, 'id' | 'lastPollAt'>> = {},
): Omit<DeviceSession, 'id' | 'lastPollAt'> {
  return {
    clientId: 'Iv1.testclient',
    deviceCode: 'dev-code-secret',
    interval: 5,
    expiresAt: Date.now() + 15 * 60 * 1000,
    ...overrides,
  };
}

describe('device-sessions store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T00:00:00Z'));
    resetStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetStore();
  });

  it('creates and retrieves a session by id', () => {
    const session = createDeviceSession(makeInput());
    expect(session.id).toBeTruthy();
    expect(session.lastPollAt).toBe(0);
    expect(getDeviceSession(session.id)).toEqual(session);
  });

  it('deletes a session', () => {
    const session = createDeviceSession(makeInput());
    deleteDeviceSession(session.id);
    expect(getDeviceSession(session.id)).toBeNull();
  });

  it('returns null for an unknown id', () => {
    expect(getDeviceSession('does-not-exist')).toBeNull();
  });

  it('purges expired sessions on get (expiry purge)', () => {
    const session = createDeviceSession(makeInput({ expiresAt: Date.now() + 60_000 }));
    expect(getDeviceSession(session.id)).not.toBeNull();

    // Advance past the TTL — the next access must drop the expired row.
    vi.advanceTimersByTime(61_000);
    expect(getDeviceSession(session.id)).toBeNull();
  });

  it('purges expired sessions on create so they do not count toward the cap', () => {
    // One soon-to-expire session, then expire it.
    createDeviceSession(makeInput({ expiresAt: Date.now() + 1_000 }));
    vi.advanceTimersByTime(2_000);

    // A fresh create triggers purgeExpired() first; the live session survives.
    const fresh = createDeviceSession(makeInput());
    expect(getDeviceSession(fresh.id)).not.toBeNull();

    let liveCount = 0;
    for (const _ of globalForSessions.__clawstashDeviceSessions!.values()) liveCount++;
    expect(liveCount).toBe(1);
  });

  it('evicts the oldest session when MAX_SESSIONS (10) is exceeded', () => {
    const created: DeviceSession[] = [];
    // Fill to the cap of 10 — all should coexist.
    for (let i = 0; i < 10; i++) {
      created.push(createDeviceSession(makeInput({ deviceCode: `code-${i}` })));
    }
    expect(globalForSessions.__clawstashDeviceSessions!.size).toBe(10);
    expect(getDeviceSession(created[0]!.id)).not.toBeNull();

    // The 11th create must evict the oldest (insertion-order) and stay at 10.
    const overflow = createDeviceSession(makeInput({ deviceCode: 'code-overflow' }));
    expect(globalForSessions.__clawstashDeviceSessions!.size).toBe(10);
    expect(getDeviceSession(created[0]!.id)).toBeNull(); // oldest evicted
    expect(getDeviceSession(created[1]!.id)).not.toBeNull(); // second-oldest kept
    expect(getDeviceSession(overflow.id)).not.toBeNull(); // newest present
  });

  it('generates unique ids across sessions', () => {
    const a = createDeviceSession(makeInput());
    const b = createDeviceSession(makeInput());
    expect(a.id).not.toBe(b.id);
  });
});
