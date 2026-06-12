import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkAdmin } from '@/app/api/_helpers';
import { GithubOwnerSchema, GithubRepoNameSchema } from '@/server/validation';
import { readBackupToken } from '@/server/backup/backup-service';
import { redactSecrets } from '@/server/backup/backup-crypto';
import { GitHubClient } from '@/server/backup/github-client';

// GET /api/backup/github/branches?owner=&repo= — branch list + default
// branch of a candidate target repo (admin).
export async function GET(req: NextRequest) {
  const admin = checkAdmin(req);
  if (!admin.ok) return admin.response;

  const owner = req.nextUrl.searchParams.get('owner') || '';
  const repo = req.nextUrl.searchParams.get('repo') || '';
  if (
    !owner ||
    !repo ||
    !GithubOwnerSchema.safeParse(owner).success ||
    !GithubRepoNameSchema.safeParse(repo).success
  ) {
    return NextResponse.json({ error: 'Valid owner and repo are required.' }, { status: 400 });
  }

  const token = readBackupToken(getDb());
  if (!token) {
    return NextResponse.json({ error: 'Not connected to GitHub.' }, { status: 400 });
  }

  try {
    const client = new GitHubClient(token);
    const [branches, info] = await Promise.all([
      client.listBranches(owner, repo),
      client.getRepo(owner, repo),
    ]);
    return NextResponse.json({
      branches,
      defaultBranch: info.defaultBranch,
      canPush: info.canPush,
    });
  } catch (err) {
    const message = redactSecrets(err instanceof Error ? err.message : String(err), [token]);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
