import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkAdmin, parseJsonBody } from '@/app/api/_helpers';
import { BackupDevicePollSchema, formatZodError } from '@/server/validation';
import { storeBackupToken } from '@/server/backup/backup-service';
import { GitHubClient } from '@/server/backup/github-client';
import { deleteDeviceSession, getDeviceSession } from '@/server/backup/device-sessions';
import { notifyBackupSettingsChanged } from '@/server/backup/backup-scheduler';

// POST /api/backup/device/poll — poll a pending device-flow login (admin).
// The browser drives the cadence; the server enforces GitHub's minimum
// interval and performs the actual token exchange. Responses are always
// 200 with a `status` field so the UI loop stays simple.
export async function POST(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  const body = await parseJsonBody(req);
  if ('error' in body) return body.error;

  const parsed = BackupDevicePollSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const session = getDeviceSession(parsed.data.sessionId);
  if (!session) {
    return NextResponse.json({
      status: 'error',
      error: 'Login session expired. Start the GitHub login again.',
    });
  }

  // Honour GitHub's poll interval without bouncing the browser request.
  if (Date.now() - session.lastPollAt < session.interval * 1000) {
    return NextResponse.json({ status: 'pending' });
  }
  session.lastPollAt = Date.now();

  try {
    const client = new GitHubClient(null);
    const result = await client.pollDeviceFlow(session.clientId, session.deviceCode);

    if (result.status === 'pending') {
      if (result.interval > session.interval) session.interval = result.interval; // slow_down
      return NextResponse.json({ status: 'pending' });
    }
    if (result.status === 'error') {
      deleteDeviceSession(session.id);
      return NextResponse.json({ status: 'error', error: result.error });
    }

    // The device code is single-use and now consumed: GitHub will reject any
    // re-poll. Persist the token FIRST so a transient failure while resolving
    // the account login no longer drops a valid, already-exchanged token and
    // forces the user to restart the flow (#115). The login is cosmetic — it
    // only labels the connection in the UI — so resolve it best-effort and
    // fall back to a placeholder the user can re-sync later.
    const db = getDb();
    let login = 'unknown';
    try {
      ({ login } = await new GitHubClient(result.token).getAuthenticatedUser());
    } catch (lookupErr) {
      console.warn(
        '[backup] token stored but account lookup failed:',
        lookupErr instanceof Error ? lookupErr.message : lookupErr,
      );
    }
    storeBackupToken(db, result.token, {
      method: 'oauth',
      login,
      connectedAt: new Date().toISOString(),
    });
    deleteDeviceSession(session.id);
    notifyBackupSettingsChanged();
    return NextResponse.json({ status: 'connected', login });
  } catch (err) {
    // Transient upstream/network failure: keep the session alive and let
    // the browser retry until the device code expires.
    console.warn('[backup] device poll failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ status: 'pending' });
  }
}
