import { NextRequest, NextResponse } from 'next/server';
import { getLlmsTxt } from '@/server/agent-guide';
import { getBaseUrl } from '@/app/api/_helpers';

// GET /llms.txt — discovery index in the llms.txt convention
// (https://llmstxt.org): where an agent that only knows the host finds the
// skill, the onboarding guide, the specifications and the status endpoints.
// Unauthenticated; describes the server, carries no stash data.
export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  return new NextResponse(getLlmsTxt(baseUrl), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
