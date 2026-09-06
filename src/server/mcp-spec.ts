/**
 * MCP Spec Generator — produces the full MCP specification as markdown.
 *
 * Tool definitions come from tool-defs.ts (single source of truth).
 * Input schemas are auto-converted from Zod → JSON Schema via zodToJsonSchema.
 * Data type schemas come from openapi.ts (shared with REST API).
 * Operational guidance (workflow, conventions, limits, errors, maintenance)
 * comes from agent-guide.ts, the same blocks the MCP `instructions`, the
 * SKILL.md and `get_server_info` use — so the three surfaces cannot drift.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getOpenApiSpec } from './openapi';
import { CLAWSTASH_PURPOSE, TOKEN_EFFICIENT_GUIDE } from './shared-text';
import { TOOL_DEFS } from './tool-defs';
import {
  AGENT_CONVENTIONS_MD,
  AGENT_ERRORS_MD,
  AGENT_WHEN_TO_USE_MD,
  AGENT_WORKFLOW_MD,
  formatLimitsMarkdown,
  getAgentEndpoints,
  getAgentMaintenanceMd,
  memoizeByBaseUrl,
} from './agent-guide';

export const getMcpSpecText = memoizeByBaseUrl((baseUrl: string): string => {
  const openapi = getOpenApiSpec(baseUrl);
  const schemas = openapi.components.schemas;
  const endpoints = getAgentEndpoints(baseUrl);

  // Format data types from OpenAPI schemas
  const schemaNames = [
    'Stash',
    'StashListItem',
    'StashFile',
    'CreateStashInput',
    'UpdateStashInput',
    'Stats',
    'AccessLogEntry',
  ];
  const dataTypesSection = schemaNames
    .filter((name) => schemas[name])
    .map((name) => `### ${name}\n\`\`\`json\n${JSON.stringify(schemas[name], null, 2)}\n\`\`\``)
    .join('\n\n');

  // Format tool definitions — input schemas auto-derived from Zod via zodToJsonSchema
  const toolsSection = TOOL_DEFS.map((t) => {
    const jsonSchema = zodToJsonSchema(t.schema, { target: 'openApi3' });
    // The required scope is part of the tool contract: `mcp` alone only opens
    // the transport, so an agent has to know which tools its token can call.
    const scopeLine =
      t.scope === 'none'
        ? '**Required scope:** none beyond `mcp` (server self-description)'
        : `**Required scope:** \`${t.scope}\``;
    return `### ${t.name}
${t.description}

${scopeLine}

**Input Schema:**
\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`

**Returns:** \`${t.returns}\``;
  }).join('\n\n---\n\n');

  const clientConfig = JSON.stringify(
    {
      mcpServers: {
        clawstash: {
          type: 'streamable-http',
          url: endpoints.mcp,
          headers: { Authorization: 'Bearer YOUR_API_TOKEN' },
        },
      },
    },
    null,
    2,
  );

  const result = `# ClawStash MCP Server Specification

## About ClawStash
${CLAWSTASH_PURPOSE}

## Connection
- **Transport:** Streamable HTTP (stateless — no session to keep alive)
- **Endpoint:** ${endpoints.mcp}
- **Method:** POST
- **Authentication:** Bearer token with the \`mcp\` scope
- **Header:** \`Authorization: Bearer <your-token>\`
- **On initialize** the server returns \`instructions\` (a compact usage guide) — clients that support them put them into the model's context automatically.

### Scopes
\`mcp\` is a **transport gate**: it permits connecting to this endpoint, nothing more.
Each tool additionally requires the scope listed with it below — \`read\` for tools that
read stash data, \`write\` for tools that create, change or delete it. A call the token's
scopes do not cover comes back as a normal tool error (\`isError: true\`) naming the
missing scope. The usual ladder applies: \`admin\` implies everything, \`write\` implies
\`read\`. A token for full agent use therefore carries \`read\`, \`write\` and \`mcp\`.
\`get_server_info\` tells you which tools the current token can call.

## Client Configuration (Streamable HTTP)
\`\`\`json
${clientConfig}
\`\`\`

## Token-Efficient Usage Patterns
${TOKEN_EFFICIENT_GUIDE}

## Limits
${formatLimitsMarkdown()}

## Resources
Besides tools the server exposes two static MCP resources (read them with \`resources/read\`):
- \`clawstash://guide/skill\` — SKILL.md, the compact operational guide (also \`GET ${endpoints.agent_skill}\`)
- \`clawstash://guide/onboarding\` — this specification wrapped in the onboarding guide (also \`GET ${endpoints.mcp_onboarding}\`)

## Tools (${TOOL_DEFS.length})

${toolsSection}

## Data Types (JSON Schema)
Data type schemas shared with the REST API (OpenAPI). Referenced in tool return types above.

${dataTypesSection}`;

  return result;
});

// ---------------------------------------------------------------------------
// MCP Onboarding Text — the operational guide first, the full spec after it
// ---------------------------------------------------------------------------

export const getMcpOnboardingText = memoizeByBaseUrl((baseUrl: string): string => {
  const spec = getMcpSpecText(baseUrl);
  const endpoints = getAgentEndpoints(baseUrl);

  const result = `# ClawStash MCP Onboarding Guide

## How to Use This Document
You are reading the onboarding guide of the ClawStash instance at ${baseUrl}. Part 1 is the
operational guide (how to connect, when to store, how to work, what the limits are); Part 2 is
the complete MCP specification with every tool's JSON Schema. A shorter, skill-file-shaped
version of Part 1 is served at \`${endpoints.agent_skill}\` — save it as \`SKILL.md\` if your
agent loads skills from files.

## Quick Start

1. **Endpoint:** \`POST ${endpoints.mcp}\` — Streamable HTTP, stateless.
2. **Auth:** \`Authorization: Bearer <token>\` — the token needs the \`mcp\` scope to reach this
   endpoint at all, plus \`read\` for the read tools and \`write\` for the write tools. \`mcp\` on
   its own is only a transport gate and grants no data access; the recommended token for an
   agent carries \`read\`, \`write\` and \`mcp\`. Tokens are created in the web GUI under
   **Settings → API & Tokens**; when the instance runs without \`ADMIN_PASSWORD\` no token is needed.
3. **Client config:**
   \`\`\`json
   {"mcpServers":{"clawstash":{"type":"streamable-http","url":"${endpoints.mcp}","headers":{"Authorization":"Bearer <token>"}}}}
   \`\`\`
4. **First call:** \`get_server_info\` — one round-trip that returns your scopes, the tools you may
   call, the size limits and every endpoint of this instance. Then \`get_stats\` and \`list_tags\`
   to see what is already stored.

## When to Store Something
${AGENT_WHEN_TO_USE_MD}

## Workflow
${AGENT_WORKFLOW_MD}

## Conventions
${AGENT_CONVENTIONS_MD}

## Errors
${AGENT_ERRORS_MD}

## Maintenance
${getAgentMaintenanceMd(baseUrl)}

---

${spec}`;

  return result;
});

// ---------------------------------------------------------------------------
// MCP Refresh Text — spec with update-focused framing for connected AI agents
// ---------------------------------------------------------------------------

export const getMcpRefreshText = memoizeByBaseUrl((baseUrl: string): string => {
  const spec = getMcpSpecText(baseUrl);
  const endpoints = getAgentEndpoints(baseUrl);

  const result = `# ClawStash MCP Tool Update

This is the current tool specification of the ClawStash instance at ${baseUrl}. Compare it with
what you know: tool names, argument names and required scopes are the parts that change between
releases. There is no need to call \`refresh_tools\` routinely — call it after a failed tool call
or after the instance was upgraded (\`check_version\`).

Operational guide (workflow, conventions, limits): \`GET ${endpoints.agent_skill}\` · full onboarding:
\`GET ${endpoints.mcp_onboarding}\`

---

${spec}`;

  return result;
});
