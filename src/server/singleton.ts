import { ClawStashDB } from './db';

// Singleton database instance shared across all API route handlers.
// Next.js may re-import modules during development (HMR), so we store
// the instance on globalThis to survive hot-reloads.

const globalForDb = globalThis as unknown as {
  __clawstashDb?: ClawStashDB;
  __clawstashDbError?: Error;
  __clawstashCleanupInterval?: ReturnType<typeof setInterval>;
};

const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function getDb(): ClawStashDB {
  // Cache constructor failures: previously, a thrown ClawStashDB constructor
  // left __clawstashDb undefined, so every subsequent getDb() call would
  // re-attempt the same failing init (re-running migrations, re-opening
  // sqlite, etc.). Cache the error and surface it directly until the
  // singleton is explicitly closed.
  if (globalForDb.__clawstashDbError) {
    throw globalForDb.__clawstashDbError;
  }
  if (!globalForDb.__clawstashDb) {
    try {
      globalForDb.__clawstashDb = new ClawStashDB();
      globalForDb.__clawstashDb.cleanExpiredSessions();
    } catch (err) {
      globalForDb.__clawstashDbError = err instanceof Error ? err : new Error(String(err));
      throw globalForDb.__clawstashDbError;
    }

    // Periodic session cleanup (prevent duplicate intervals during HMR)
    if (!globalForDb.__clawstashCleanupInterval) {
      globalForDb.__clawstashCleanupInterval = setInterval(() => {
        try {
          globalForDb.__clawstashDb?.cleanExpiredSessions();
        } catch {
          // Ignore errors during cleanup
        }
      }, SESSION_CLEANUP_INTERVAL_MS);
      // Allow process to exit cleanly without waiting for this interval
      if (globalForDb.__clawstashCleanupInterval.unref) {
        globalForDb.__clawstashCleanupInterval.unref();
      }
    }
  }
  return globalForDb.__clawstashDb;
}

export function closeDb(): void {
  if (globalForDb.__clawstashCleanupInterval) {
    clearInterval(globalForDb.__clawstashCleanupInterval);
    globalForDb.__clawstashCleanupInterval = undefined;
  }
  if (globalForDb.__clawstashDb) {
    globalForDb.__clawstashDb.close();
    globalForDb.__clawstashDb = undefined;
  }
  // Clear any cached init error so a manual close() + reopen attempt has a
  // chance to succeed (e.g. after the underlying disk issue is resolved).
  globalForDb.__clawstashDbError = undefined;
}
