import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope } from '@/app/api/_helpers';

export async function GET(req: NextRequest) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;
  // Mirror the stash list behaviour: ?include_archived=true to include archived
  // stashes in the tag counts. Default = exclude (matches default listStashes).
  const includeArchived = req.nextUrl.searchParams.get('include_archived') === 'true';
  return NextResponse.json(getDb().getAllTags({ includeArchived }));
}
