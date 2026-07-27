import { NextRequest, NextResponse } from 'next/server';
import { checkVersion, getPublicVersionInfo } from '@/server/version';
import { isAuthEnabled } from '@/server/auth';
import { checkScope } from '@/app/api/_helpers';

// GET /api/version — running build info + update check against GitHub.
//
// Gated like /api/health: in open mode (no ADMIN_PASSWORD) every caller gets
// the full payload. Once auth is enabled, the build fingerprint (branch,
// commit SHA, build date) requires the `read` scope — it tells an anonymous
// caller exactly which commit is deployed, which is the first step in matching
// a known vulnerable build. Unauthorised callers get the reduced
// `getPublicVersionInfo()` shape (200, `current: null`) rather than a 401 so
// external uptime probes keep working.
//
// The scope check also gates the outbound GitHub commits request that
// `checkVersion()` performs on a cache miss, so an anonymous caller can
// neither trigger server-side egress nor burn the shared unauthenticated
// GitHub rate limit.
export async function GET(req: NextRequest) {
  if (isAuthEnabled()) {
    const scope = checkScope(req, 'read');
    if (!scope.ok) {
      return NextResponse.json(getPublicVersionInfo());
    }
  }

  const info = await checkVersion();
  return NextResponse.json(info);
}
