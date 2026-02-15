import { ClawStashDB } from './db';

// Singleton database instance shared across all API route handlers.
// Next.js may re-import modules during development (HMR), so we store
// the instance on globalThis to survive hot-reloads.

const globalForDb = globalThis as unknown as { __clawstashDb?: ClawStashDB };

export function getDb(): ClawStashDB {
  if (!globalForDb.__clawstashDb) {
    globalForDb.__clawstashDb = new ClawStashDB();
    globalForDb.__clawstashDb.cleanExpiredSessions();
  }
  return globalForDb.__clawstashDb;
}
