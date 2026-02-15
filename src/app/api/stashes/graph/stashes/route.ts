import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope } from '@/app/api/_helpers';

export async function GET(req: NextRequest) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { searchParams } = req.nextUrl;
  const mode = (searchParams.get('mode') as 'relations' | 'timeline' | 'versions') || undefined;
  const since = searchParams.get('since') || undefined;
  const until = searchParams.get('until') || undefined;
  const tag = searchParams.get('tag') || undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;
  const include_versions = searchParams.get('include_versions') === 'true';
  const min_shared_tags = searchParams.get('min_shared_tags') ? parseInt(searchParams.get('min_shared_tags')!, 10) : undefined;

  return NextResponse.json(getDb().getStashGraph({ mode, since, until, tag, limit, include_versions, min_shared_tags }));
}
