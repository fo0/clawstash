import { NextRequest, NextResponse } from 'next/server';
import { getAgentSkillText } from '@/server/agent-guide';
import { getBaseUrl } from '@/app/api/_helpers';

// GET /api/agent-skill — SKILL.md for AI agents (Agent Skills format).
//
// Unauthenticated like the other self-description endpoints (/api/openapi,
// /api/mcp-spec, /api/mcp-onboarding): it describes how to use the server and
// carries no stash data. The same text is served as the MCP resource
// `clawstash://guide/skill`.
export async function GET(req: NextRequest) {
  const baseUrl = getBaseUrl(req);
  return new NextResponse(getAgentSkillText(baseUrl), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
}
