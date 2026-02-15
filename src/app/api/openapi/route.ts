import { NextRequest, NextResponse } from 'next/server';
import { getOpenApiSpec } from '@/server/openapi';
import { getBaseUrl } from '@/app/api/_helpers';

export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  return NextResponse.json(getOpenApiSpec(baseUrl));
}
