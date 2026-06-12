import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkAdmin, parseJsonBody } from '@/app/api/_helpers';
import { BackupDeviceStartSchema, formatZodError } from '@/server/validation';
import { readBackupSettings, writeBackupSettings } from '@/server/backup/backup-service';
import { GitHubApiError, GitHubClient } from '@/server/backup/github-client';
import { createDeviceSession } from '@/server/backup/device-sessions';

// POST /api/backup/device/start — begin the GitHub OAuth device flow
// (admin). Returns the user code + verification URI; the device code stays
// server-side in the session store.
export async function POST(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  const body = await parseJsonBody(req);
  if ('error' in body) return body.error;

  const parsed = BackupDeviceStartSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const db = getDb();
  const settings = readBackupSettings(db);
  const clientId = parsed.data.clientId || settings.oauthClientId;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          'OAuth client ID required. Create a GitHub OAuth app (with Device Flow enabled) and enter its client ID.',
      },
      { status: 400 },
    );
  }
  // Remember a newly entered client ID for the next login.
  if (parsed.data.clientId && parsed.data.clientId !== settings.oauthClientId) {
    writeBackupSettings(db, { ...settings, oauthClientId: parsed.data.clientId });
  }

  try {
    const flow = await new GitHubClient(null).startDeviceFlow(clientId);
    const session = createDeviceSession({
      clientId,
      deviceCode: flow.deviceCode,
      interval: flow.interval,
      expiresAt: Date.now() + flow.expiresIn * 1000,
    });
    return NextResponse.json({
      sessionId: session.id,
      userCode: flow.userCode,
      verificationUri: flow.verificationUri,
      interval: flow.interval,
      expiresIn: flow.expiresIn,
    });
  } catch (err) {
    const status = err instanceof GitHubApiError && err.status < 500 ? 400 : 502;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'GitHub device flow failed' },
      { status },
    );
  }
}
