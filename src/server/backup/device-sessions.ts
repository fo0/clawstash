import crypto from 'crypto';

/**
 * In-memory store for pending GitHub OAuth device-flow logins (refs #108).
 *
 * The device code is the secret half of the flow — together with the client
 * ID it can be exchanged for an access token once the user approves. It
 * therefore never leaves the server; the browser only sees an opaque
 * session ID plus the user-facing code.
 *
 * Sessions are short-lived (GitHub expires device codes after ~15 min) and
 * process-local: a restart simply aborts the login. globalThis-backed so
 * dev-mode HMR does not wipe an in-progress login.
 */

export interface DeviceSession {
  id: string;
  clientId: string;
  deviceCode: string;
  /** Minimum poll interval (seconds) demanded by GitHub. */
  interval: number;
  expiresAt: number;
  lastPollAt: number;
}

const MAX_SESSIONS = 10;

const globalForSessions = globalThis as unknown as {
  __clawstashDeviceSessions?: Map<string, DeviceSession>;
};

function sessions(): Map<string, DeviceSession> {
  if (!globalForSessions.__clawstashDeviceSessions) {
    globalForSessions.__clawstashDeviceSessions = new Map();
  }
  return globalForSessions.__clawstashDeviceSessions;
}

function purgeExpired(): void {
  const now = Date.now();
  for (const [id, session] of sessions()) {
    if (session.expiresAt <= now) sessions().delete(id);
  }
}

export function createDeviceSession(
  input: Omit<DeviceSession, 'id' | 'lastPollAt'>,
): DeviceSession {
  purgeExpired();
  // Bound concurrent logins; evict the oldest if an operator spams "connect".
  while (sessions().size >= MAX_SESSIONS) {
    const oldest = sessions().keys().next().value;
    if (oldest === undefined) break;
    sessions().delete(oldest);
  }
  const session: DeviceSession = { ...input, id: crypto.randomUUID(), lastPollAt: 0 };
  sessions().set(session.id, session);
  return session;
}

export function getDeviceSession(id: string): DeviceSession | null {
  purgeExpired();
  return sessions().get(id) ?? null;
}

export function deleteDeviceSession(id: string): void {
  sessions().delete(id);
}
