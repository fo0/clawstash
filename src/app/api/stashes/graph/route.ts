import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, parsePositiveInt } from '@/app/api/_helpers';

export async function GET(req: NextRequest) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { searchParams } = req.nextUrl;
  const tag = searchParams.get('tag') || undefined;
  const depth = parsePositiveInt(searchParams.get('depth'));
  const min_weight = parsePositiveInt(searchParams.get('min_weight'));
  const min_count = parsePositiveInt(searchParams.get('min_count'));
  const limit = parsePositiveInt(searchParams.get('limit'));

  return NextResponse.json(getDb().getTagGraph({ tag, depth, min_weight, min_count, limit }));
}
