import { NextRequest, NextResponse } from 'next/server';
import { getMcpSpecText } from '@/server/mcp-spec';
import { getBaseUrl } from '@/app/api/_helpers';

export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  return new NextResponse(getMcpSpecText(baseUrl), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
