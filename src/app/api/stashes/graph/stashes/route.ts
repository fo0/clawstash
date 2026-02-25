import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, parsePositiveInt } from '@/app/api/_helpers';

const VALID_MODES = new Set(['relations', 'timeline', 'versions']);

export async function GET(req: NextRequest) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { searchParams } = req.nextUrl;
  const rawMode = searchParams.get('mode');
  const mode = rawMode && VALID_MODES.has(rawMode) ? rawMode as 'relations' | 'timeline' | 'versions' : undefined;
  const since = searchParams.get('since') || undefined;
  const until = searchParams.get('until') || undefined;
  const tag = searchParams.get('tag') || undefined;
  const limit = parsePositiveInt(searchParams.get('limit'));
  const include_versions = searchParams.get('include_versions') === 'true';
  const min_shared_tags = parsePositiveInt(searchParams.get('min_shared_tags'));

  return NextResponse.json(getDb().getStashGraph({ mode, since, until, tag, limit, include_versions, min_shared_tags }));
}
