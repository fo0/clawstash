/**
 * In-memory sliding-window rate limit for sensitive auth endpoints
 * (admin login + API token validation).
 *
 * Notes:
 * - This module is loaded by route handlers running in the Node runtime.
 *   It is NOT used from `src/middleware.ts` (Edge runtime, separate
 *   `globalThis`) because the two runtimes cannot share a JS Map. Both
 *   the rate-limit check and the success-reset must therefore live in the
 *   same runtime.
 * - Persists across Next.js HMR via `globalThis` (same pattern as
 *   `src/server/singleton.ts`).
 * - Best-effort IP extraction. `x-forwarded-for` is spoofable without a
 *   trusted reverse proxy. To opt-in to forwarded headers, set
 *   `TRUST_PROXY=1`. By default we read only `x-real-ip` (set by Next.js
 *   from the socket address when NEXT_HTTP_RUNTIME hands it through), and
 *   fall back to a per-request random key (which effectively skips the
 *   rate limit for that request rather than collapsing every unproxied
 *   caller into a single shared bucket — the previous behavior allowed a
 *   single attacker to lock out every legitimate admin).
 */
import crypto from 'crypto';
import type { NextRequest } from 'next/server';

export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_WINDOW_SEC = Math.floor(RATE_LIMIT_WINDOW_MS / 1000);
const RATE_LIMIT_MAX = 10; // max attempts per window per (scope, ip)
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes — sweep stale buckets

type Scope = 'login' | 'token-validate';

interface RateLimitState {
  attempts: Map<string, { count: number; resetAt: number }>;
  cleanupTimer?: ReturnType<typeof setInterval>;
}

const globalState = globalThis as unknown as {
  __clawstashAuthRateLimit?: RateLimitState;
};

const state: RateLimitState = (globalState.__clawstashAuthRateLimit ??= {
  attempts: new Map(),
});

if (!state.cleanupTimer) {
  state.cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of state.attempts) {
      if (now > entry.resetAt) state.attempts.delete(key);
    }
  }, RATE_LIMIT_CLEANUP_INTERVAL_MS);
  // Don't keep the event loop alive for this cleanup interval.
  state.cleanupTimer.unref?.();
}

function key(scope: Scope, ip: string): string {
  return `${scope}:${ip}`;
}

/**
 * Check the rate limit AND record the attempt as consumed.
 * Returns `{ allowed: false, retryAfter }` (in seconds) when the
 * threshold has been hit for this (scope, ip).
 *
 * IMPORTANT: only call this once you actually have a real auth attempt
 * to evaluate (e.g. after parsing the body / extracting the token).
 * Calling it before validation lets malformed requests burn the bucket
 * and lock out legitimate users (DoS).
 */
export function checkAndRecordAuthAttempt(
  scope: Scope,
  ip: string,
): { allowed: boolean; retryAfter?: number } {
  const k = key(scope, ip);
  const now = Date.now();
  const entry = state.attempts.get(k);

  if (!entry || now > entry.resetAt) {
    state.attempts.set(k, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count++;
  return { allowed: true };
}

/**
 * Clear the per-IP failed-attempt counter for this scope.
 * Called on a successful login so a legitimate user who eventually
 * supplied the right password is not locked out for the rest of the
 * 15-minute window. Only the matching scope is cleared — a successful
 * login does NOT reset a parallel `token-validate` brute-force counter
 * (and vice-versa).
 */
export function resetAuthAttempts(scope: Scope, ip: string): void {
  state.attempts.delete(key(scope, ip));
}

/**
 * Best-effort client-IP extraction for rate-limit keying.
 *
 * Without a trusted proxy boundary, `x-forwarded-for` is attacker-
 * controlled. By default we therefore IGNORE it and read only
 * `x-real-ip` (which Next.js sets from the socket when no proxy is in
 * front). Set `TRUST_PROXY=1` (or `=true`) to opt back in to the
 * forwarded headers when running behind a trusted reverse proxy.
 *
 * If neither header yields an IP, we generate a per-request random
 * bucket key. This effectively disables the rate limit for that single
 * request, which is intentional: collapsing every unproxied caller into
 * a shared `'unknown'` bucket let one attacker exhaust the limit and
 * lock out every legitimate admin on a default Docker deploy.
 */
export function getClientIp(req: NextRequest): string {
  const trustProxy = process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true';

  if (trustProxy) {
    const xff = req.headers.get('x-forwarded-for')?.split(',')[0].trim();
    if (xff) return xff;
  }

  const xRealIp = req.headers.get('x-real-ip')?.trim();
  if (xRealIp) return xRealIp;

  // Per-request random bucket: effectively no rate-limit for THIS request,
  // but other requests still have their own keys. Better than one shared
  // 'unknown' bucket that any attacker can exhaust to lock out everyone.
  return `anon-${crypto.randomBytes(8).toString('hex')}`;
}
