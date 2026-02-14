/**
 * MCP Spec Generator — produces the full MCP specification as markdown.
 *
 * Tool definitions come from tool-defs.ts (single source of truth).
 * Input schemas are auto-converted from Zod → JSON Schema via zodToJsonSchema.
 * Data type schemas come from openapi.ts (shared with REST API).
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getOpenApiSpec } from './openapi.js';
import { CLAWSTASH_PURPOSE, TOKEN_EFFICIENT_GUIDE } from './shared-text.js';
import { TOOL_DEFS } from './tool-defs.js';

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
