import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkAdmin } from '@/app/api/_helpers';
import { readBackupToken } from '@/server/backup/backup-service';
import { redactSecrets } from '@/server/backup/backup-crypto';
import { GitHubClient } from '@/server/backup/github-client';

// GET /api/backup/github/repos — repositories visible to the connected
// account, for the target-repo picker (admin).
export async function GET(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  const token = readBackupToken(getDb());
  if (!token) {
    return NextResponse.json({ error: 'Not connected to GitHub.' }, { status: 400 });
  }

  try {
    const repos = await new GitHubClient(token).listRepos();
    return NextResponse.json({ repos });
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err), [token]);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
