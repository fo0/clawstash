/**
 * `get_server_info` payload — the one call an agent makes first.
 *
 * Pure: takes the caller's scopes and the request-derived base URL, returns
 * a plain object. Kept out of mcp-server.ts so the MCP file stays a
 * registration table and this shape can be unit-tested without an SDK
 * client. Same fingerprint rule as `/api/version` and `check_version`: the
 * build version is withheld unless the caller holds `read`, so an mcp-only
 * token learns which tools it may call, not which commit is deployed.
 */
import type { McpAuthContext } from './mcp-server';
import { hasScope } from './auth';
import { getAgentEndpoints, getAgentLimits } from './agent-guide';
import type { AgentEndpoints, AgentLimits } from './agent-guide';
import { TOOL_DEFS } from './tool-defs';
import { getCurrentBuild } from './version';

export interface ServerInfo {
  server: { name: 'clawstash'; version: string | null };
  transport: 'streamable-http' | 'stdio';
  base_url: string;
  endpoints: AgentEndpoints;
  auth: {
    scopes: string[];
    tools: { callable: string[]; requires_scope: Array<{ tool: string; scope: string }> };
  };
  limits: AgentLimits;
  tool_count: number;
  next_steps: string[];
}

export function buildServerInfo(
  auth: McpAuthContext,
  baseUrl: string,
  transport: ServerInfo['transport'],
): ServerInfo {
  const callable: string[] = [];
  const requiresScope: Array<{ tool: string; scope: string }> = [];
  for (const def of TOOL_DEFS) {
    if (def.scope === 'none' || hasScope(auth.scopes, def.scope)) callable.push(def.name);
    else requiresScope.push({ tool: def.name, scope: def.scope });
  }
  const canRead = hasScope(auth.scopes, 'read');
  const canWrite = hasScope(auth.scopes, 'write');
  const endpoints = getAgentEndpoints(baseUrl);
  const nextSteps = canRead
    ? [
        'Call get_stats and list_tags to see what is stored and which tags are in use.',
        'Use search_stashes before creating a stash so you extend existing material instead of duplicating it.',
        ...(canWrite
          ? ['Store with create_stash; tell the user the stash name and ID afterwards.']
          : [
              'This token cannot write: ask the operator for a token with the write scope before trying create_stash or update_stash.',
            ]),
        `Read the SKILL.md at ${endpoints.agent_skill} for conventions and the REST twins of every tool.`,
      ]
    : [
        'This token holds only the mcp transport scope: it can read the server specification but no stash data.',
        'Ask the operator for a token with the scopes read, write and mcp (Settings → API & Tokens in the web GUI).',
      ];
  return {
    server: { name: 'clawstash', version: canRead ? getCurrentBuild().version : null },
    transport,
    base_url: baseUrl,
    endpoints,
    auth: {
      scopes: [...auth.scopes],
      tools: { callable, requires_scope: requiresScope },
    },
    limits: getAgentLimits(),
    tool_count: TOOL_DEFS.length,
    next_steps: nextSteps,
  };
}
