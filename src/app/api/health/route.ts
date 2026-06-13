import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { isAuthEnabled } from '@/server/auth';
import { checkScope } from '@/app/api/_helpers';

// GET /api/health — liveness probe for Docker/LB health checks.
//
// When auth is disabled (open mode) the response includes the stash/file
// counts so operators can confirm data is present without a separate call.
// When auth is enabled the stash/file counts are gated behind the `read`
// scope to prevent unauthenticated callers from inferring the instance's
// content volume. The database-connectivity signal (status: ok/error) is
// always public so load-balancers without credentials can still route
// traffic correctly.
export async function GET(req: NextRequest) {
  // Always return the DB liveness signal — that is the primary use-case
  // for a health endpoint (load-balancer / Docker HEALTHCHECK) and does
  // not leak sensitive data.
  let dbConnected = false;
  let stats: { totalStashes: number; totalFiles: number } | null = null;

  try {
    const db = getDb();
    dbConnected = true;

    // Include counts only when the caller is authorised to read them.
    // In open mode every caller qualifies (isAuthEnabled() === false →
    // checkScope always succeeds). When auth is on, omit counts for
    // unauthenticated probes so the instance's content volume is not
    // disclosed to anonymous callers.
    if (!isAuthEnabled()) {
      stats = db.getStats();
    } else {
      const scope = checkScope(req, 'read');
      if (scope.ok) {
        stats = db.getStats();
      }
    }
  } catch {
    // DB error — fall through to the error response below.
  }

  if (!dbConnected) {
    return NextResponse.json(
      { status: 'error', timestamp: new Date().toISOString(), database: { connected: false } },
      { status: 503 },
    );
  }

  const database: Record<string, unknown> = { connected: true };
  if (stats !== null) {
    database.stashes = stats.totalStashes;
    database.files = stats.totalFiles;
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database,
  });
}
