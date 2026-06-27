import type { DeviceSession } from './device-sessions';

/**
 * Testable core of the device-flow poll route (refs #108, #111).
 *
 * The route handler (`src/app/api/backup/device/poll/route.ts`) owns HTTP
 * concerns (auth, body parsing, `NextResponse`); this module owns the actual
 * poll *logic* so it can be unit-tested without a route-handler harness:
 *
 * - server-side minimum-interval enforcement (the browser drives cadence but
 *   the server refuses to hit GitHub faster than the negotiated interval),
 * - the `slow_down` interval bump,
 * - the single-use device-code lifecycle (token persisted *before* the
 *   cosmetic account-login lookup, session deleted on terminal outcomes), and
 * - transient-failure handling that keeps the session alive for a retry.
 *
 * All side effects (GitHub calls, token storage, session deletion, scheduler
 * notification) are injected via {@link DevicePollDeps} so a test can supply
 * fakes — no network, no DB, deterministic clock.
 */

/** Outcome of one poll attempt. Mirrors the route's `status` field 1:1. */
export type DevicePollOutcome =
  | { status: 'pending' }
  | { status: 'connected'; login: string }
  | { status: 'error'; error: string };

/** GitHub poll result shape consumed here (subset of `DeviceFlowPollResult`). */
export type DeviceFlowPollResult =
  | { status: 'connected'; token: string }
  | { status: 'pending'; interval: number }
  | { status: 'error'; error: string };

/** Injected, side-effecting collaborators — faked in tests. */
export interface DevicePollDeps {
  /** Exchange the (single-use) device code for an access token. */
  pollDeviceFlow(clientId: string, deviceCode: string): Promise<DeviceFlowPollResult>;
  /** Resolve the account login for the freshly exchanged token (cosmetic). */
  getAuthenticatedUser(token: string): Promise<{ login: string }>;
  /** Persist the exchanged token + connection metadata. */
  storeToken(token: string, login: string): void;
  /** Drop the (now-consumed or failed) device session. */
  deleteSession(id: string): void;
  /** Tell the backup scheduler the connection changed. */
  notifyChanged(): void;
}

/**
 * Run one poll cycle against `session`, mutating its `lastPollAt`/`interval`
 * exactly as the route did. Returns the outcome the route serialises as JSON.
 * `now` defaults to `Date.now` so tests can pin the clock.
 */
export async function processDevicePoll(
  session: DeviceSession,
  deps: DevicePollDeps,
  now: () => number = Date.now,
): Promise<DevicePollOutcome> {
  // Honour GitHub's poll interval without bouncing the browser request.
  if (now() - session.lastPollAt < session.interval * 1000) {
    return { status: 'pending' };
  }
  session.lastPollAt = now();

  try {
    const result = await deps.pollDeviceFlow(session.clientId, session.deviceCode);

    if (result.status === 'pending') {
      if (result.interval > session.interval) session.interval = result.interval; // slow_down
      return { status: 'pending' };
    }
    if (result.status === 'error') {
      deps.deleteSession(session.id);
      return { status: 'error', error: result.error };
    }

    // The device code is single-use and now consumed: GitHub will reject any
    // re-poll. Persist the token FIRST so a transient failure while resolving
    // the account login no longer drops a valid, already-exchanged token and
    // forces the user to restart the flow (#115). The login is cosmetic — it
    // only labels the connection in the UI — so resolve it best-effort and
    // fall back to a placeholder the user can re-sync later.
    let login = 'unknown';
    try {
      ({ login } = await deps.getAuthenticatedUser(result.token));
    } catch (lookupErr) {
      console.warn(
        '[backup] token stored but account lookup failed:',
        lookupErr instanceof Error ? lookupErr.message : lookupErr,
      );
    }
    deps.storeToken(result.token, login);
    deps.deleteSession(session.id);
    deps.notifyChanged();
    return { status: 'connected', login };
  } catch (err) {
    // Transient upstream/network failure: keep the session alive and let
    // the browser retry until the device code expires.
    console.warn('[backup] device poll failed:', err instanceof Error ? err.message : err);
    return { status: 'pending' };
  }
}
