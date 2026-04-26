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
 * - Best-effort IP extraction; spoofable without a trusted reverse proxy
 *   (tracked separately in BACKLOG).
 */
import type { NextRequest } from 'next/server';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10; // max attempts per window per (scope, ip)

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
  }, 5 * 60 * 1000);
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
 * 15-minute window.
 */
export function resetAuthAttempts(scope: Scope, ip: string): void {
  state.attempts.delete(key(scope, ip));
}

/**
 * Best-effort client-IP extraction for rate-limit keying.
 * Spoofable without a trusted proxy boundary — see BACKLOG #15.
 */
export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown'
  );
}
