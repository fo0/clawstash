import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkAdmin, parseJsonBody } from '@/app/api/_helpers';
import { BackupDevicePollSchema, formatZodError } from '@/server/validation';
import { storeBackupToken } from '@/server/backup/backup-service';
import { GitHubClient } from '@/server/backup/github-client';
import { deleteDeviceSession, getDeviceSession } from '@/server/backup/device-sessions';
import { notifyBackupSettingsChanged } from '@/server/backup/backup-scheduler';
import { processDevicePoll } from '@/server/backup/device-poll';

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

  const db = getDb();
  const outcome = await processDevicePoll(session, {
    pollDeviceFlow: (clientId, deviceCode) =>
      new GitHubClient(null).pollDeviceFlow(clientId, deviceCode),
    getAuthenticatedUser: (token) => new GitHubClient(token).getAuthenticatedUser(),
    storeToken: (token, login) =>
      storeBackupToken(db, token, {
        method: 'oauth',
        login,
        connectedAt: new Date().toISOString(),
      }),
    deleteSession: deleteDeviceSession,
    notifyChanged: notifyBackupSettingsChanged,
  });

  return NextResponse.json(outcome);
}
