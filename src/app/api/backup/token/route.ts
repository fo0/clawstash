import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkAdmin, parseJsonBody } from '@/app/api/_helpers';
import { BackupPatSchema, formatZodError } from '@/server/validation';
import { clearBackupToken, storeBackupToken } from '@/server/backup/backup-service';
import { redactSecrets } from '@/server/backup/backup-crypto';
import { GitHubApiError, GitHubClient } from '@/server/backup/github-client';
import { notifyBackupSettingsChanged } from '@/server/backup/backup-scheduler';
import { buildBackupSettingsResponse } from '../_helpers';

// POST /api/backup/token — connect with a personal access token (admin).
// The token is validated against the GitHub API before being stored
// encrypted; it never appears in responses, logs, or error messages.
export async function POST(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  const body = await parseJsonBody(req);
  if ('error' in body) return body.error;

  const parsed = BackupPatSchema.safeParse(body.data);
  if (!parsed.success) {
    return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
  }

  const token = parsed.data.token;
  let login: string;
  try {
    ({ login } = await new GitHubClient(token).getAuthenticatedUser());
  } catch (err) {
    if (err instanceof GitHubApiError && err.status === 401) {
      return NextResponse.json({ error: 'GitHub rejected the token.' }, { status: 400 });
    }
    const message = redactSecrets(err instanceof Error ? err.message : String(err), [token]);
    return NextResponse.json({ error: `Could not verify token: ${message}` }, { status: 502 });
  }

  const db = getDb();
  storeBackupToken(db, token, { method: 'pat', login, connectedAt: new Date().toISOString() });
  notifyBackupSettingsChanged();
  return NextResponse.json(buildBackupSettingsResponse(db));
}

// DELETE /api/backup/token — disconnect from GitHub (admin)
export async function DELETE(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  const db = getDb();
  clearBackupToken(db);
  notifyBackupSettingsChanged();
  return NextResponse.json(buildBackupSettingsResponse(db));
}
