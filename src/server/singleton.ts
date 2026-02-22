import { ClawStashDB } from './db';

// Singleton database instance shared across all API route handlers.
// Next.js may re-import modules during development (HMR), so we store
// the instance on globalThis to survive hot-reloads.

const globalForDb = globalThis as unknown as {
  __clawstashDb?: ClawStashDB;
  __clawstashCleanupInterval?: ReturnType<typeof setInterval>;
};

const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function getDb(): ClawStashDB {
  if (!globalForDb.__clawstashDb) {
    globalForDb.__clawstashDb = new ClawStashDB();
    globalForDb.__clawstashDb.cleanExpiredSessions();

    // Periodic session cleanup (prevent duplicate intervals during HMR)
    if (!globalForDb.__clawstashCleanupInterval) {
      globalForDb.__clawstashCleanupInterval = setInterval(() => {
        try {
          globalForDb.__clawstashDb?.cleanExpiredSessions();
        } catch {
          // Ignore errors during cleanup
        }
      }, SESSION_CLEANUP_INTERVAL_MS);
    }
  }
  return globalForDb.__clawstashDb;
}
