/**
 * MCP Spec Generator — produces the full MCP specification as markdown.
 *
 * Tool definitions come from tool-defs.ts (single source of truth).
 * Input schemas are auto-converted from Zod → JSON Schema via zodToJsonSchema.
 * Data type schemas come from openapi.ts (shared with REST API).
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getOpenApiSpec } from './openapi';
import { CLAWSTASH_PURPOSE, TOKEN_EFFICIENT_GUIDE } from './shared-text';
import { TOOL_DEFS } from './tool-defs';

const mcpSpecCache = new Map<string, string>();

export function getMcpSpecText(baseUrl: string): string {
  const cached = mcpSpecCache.get(baseUrl);
  if (cached) return cached;

  const openapi = getOpenApiSpec(baseUrl);
  const schemas = openapi.components.schemas;

  // Format data types from OpenAPI schemas
  const schemaNames = ['Stash', 'StashListItem', 'StashFile', 'CreateStashInput', 'UpdateStashInput', 'Stats', 'AccessLogEntry'];
  const dataTypesSection = schemaNames
    .filter(name => schemas[name])
    .map(name => `### ${name}\n\`\`\`json\n${JSON.stringify(schemas[name], null, 2)}\n\`\`\``)
    .join('\n\n');

  // Format tool definitions — input schemas auto-derived from Zod via zodToJsonSchema
  const toolsSection = TOOL_DEFS.map(t => {
    const jsonSchema = zodToJsonSchema(t.schema, { target: 'openApi3' });
    return `### ${t.name}
${t.description}

**Input Schema:**
\`\`\`json
${JSON.stringify(jsonSchema, null, 2)}
\`\`\`

**Returns:** \`${t.returns}\``;
  }).join('\n\n---\n\n');

  const clientConfig = JSON.stringify({
    mcpServers: {
      clawstash: {
        type: 'streamable-http',
        url: `${baseUrl}/mcp`,
        headers: { Authorization: 'Bearer YOUR_API_TOKEN' },
      },
    },
  }, null, 2);

  const result = `# ClawStash MCP Server Specification

## About ClawStash
${CLAWSTASH_PURPOSE}

## Connection
- **Transport:** Streamable HTTP
- **Endpoint:** ${baseUrl}/mcp
- **Method:** POST
- **Authentication:** Bearer token with MCP scope
- **Header:** \`Authorization: Bearer <your-token>\`

## Client Configuration (Streamable HTTP)
\`\`\`json
${clientConfig}
\`\`\`

## Token-Efficient Usage Patterns
${TOKEN_EFFICIENT_GUIDE}

## Tools (${TOOL_DEFS.length})

${toolsSection}

## Data Types (JSON Schema)
Data type schemas shared with the REST API (OpenAPI). Referenced in tool return types above.

${dataTypesSection}`;

  mcpSpecCache.set(baseUrl, result);
  return result;
}

// ---------------------------------------------------------------------------
// MCP Onboarding Text — wraps the spec with self-onboarding instructions
// ---------------------------------------------------------------------------

const onboardingCache = new Map<string, string>();

export function getMcpOnboardingText(baseUrl: string): string {
  const cached = onboardingCache.get(baseUrl);
  if (cached) return cached;

  const spec = getMcpSpecText(baseUrl);

  const result = `# ClawStash MCP Onboarding Guide

## How to Use This Document
You are reading the ClawStash MCP onboarding specification. This document contains everything you need to connect and interact with this ClawStash instance via MCP (Model Context Protocol).

**Once connected via MCP**, call the \`refresh_tools\` tool periodically to stay up-to-date — tool definitions and capabilities may change over time. You can also re-fetch this document at \`${baseUrl}/api/mcp-onboarding\`.

## Quick Start

1. **Endpoint:** \`POST ${baseUrl}/mcp\`
2. **Transport:** Streamable HTTP (stateless)
3. **Auth:** \`Authorization: Bearer <token>\` — token needs \`mcp\` scope
4. **First steps after connecting:**
   - Call \`get_stats\` to see what's stored
   - Call \`list_tags\` to discover content categories
   - Call \`list_stashes\` to browse available stashes
   - Call \`search_stashes\` to find specific content by keyword

## Recommended Workflow

1. **Discover** — Use \`list_stashes\`, \`list_tags\`, or \`search_stashes\` to find relevant stashes (returns summaries only, no file content).
2. **Inspect** — Use \`read_stash\` to get metadata and file list with sizes (no content by default).
3. **Read** — Use \`read_stash_file\` to selectively read only the files you need (most token-efficient).
4. **Store** — Use \`create_stash\` or \`update_stash\` to save new data. Use descriptive names, descriptions, and tags for discoverability.
5. **Refresh** — Call the \`refresh_tools\` MCP tool whenever you need to re-check available tools and capabilities.

---

${spec}`;

  onboardingCache.set(baseUrl, result);
  return result;
}

// ---------------------------------------------------------------------------
// MCP Refresh Text — spec with update-focused framing for connected AI agents
// ---------------------------------------------------------------------------

const refreshCache = new Map<string, string>();

export function getMcpRefreshText(baseUrl: string): string {
  const cached = refreshCache.get(baseUrl);
  if (cached) return cached;

  const spec = getMcpSpecText(baseUrl);

  const result = `# ClawStash MCP Tool Update

**Call \`refresh_tools\` periodically to stay up-to-date.** Tool definitions and capabilities may change over time.

For initial onboarding (before MCP is connected), use the REST endpoint: \`GET ${baseUrl}/api/mcp-onboarding\`

---

${spec}`;

  refreshCache.set(baseUrl, result);
  return result;
}
