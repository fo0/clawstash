import { NextRequest, NextResponse } from 'next/server';
import { getMcpOnboardingText } from '@/server/mcp-spec';
import { getBaseUrl } from '@/app/api/_helpers';

export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  return new NextResponse(getMcpOnboardingText(baseUrl), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
