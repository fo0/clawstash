import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/singleton';
import { checkScope } from '@/app/api/_helpers';

export async function GET(req: NextRequest) {
  const scope = checkScope(req, 'read');
  if (!scope.ok) return scope.response;

  const { searchParams } = req.nextUrl;
  const tag = searchParams.get('tag') || undefined;
  const depth = searchParams.get('depth') ? parseInt(searchParams.get('depth')!, 10) : undefined;
  const min_weight = searchParams.get('min_weight') ? parseInt(searchParams.get('min_weight')!, 10) : undefined;
  const min_count = searchParams.get('min_count') ? parseInt(searchParams.get('min_count')!, 10) : undefined;
  const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

  return NextResponse.json(getDb().getTagGraph({ tag, depth, min_weight, min_count, limit }));
}
