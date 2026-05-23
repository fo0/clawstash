import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope, parsePositiveInt, parseNonNegativeInt } from '@/app/api/_helpers';

export async function GET(req: NextRequest) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { searchParams } = req.nextUrl;
  const tag = searchParams.get('tag') || undefined;
  const depth = parsePositiveInt(searchParams.get('depth'));
  // `min_weight` / `min_count` accept 0 as "no filter" (matches the MCP /
  // direct DB callers); `parsePositiveInt` would silently swallow 0 here.
  // Closes BACKLOG #85.
  const min_weight = parseNonNegativeInt(searchParams.get('min_weight'));
  const min_count = parseNonNegativeInt(searchParams.get('min_count'));
  const limit = parsePositiveInt(searchParams.get('limit'));

  return NextResponse.json(getDb().getTagGraph({ tag, depth, min_weight, min_count, limit }));
}
