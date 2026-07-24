/**
 * API UI data — minimal frontend-specific constants and helpers.
 *
 * Tool definitions and endpoint docs are NOT hardcoded here.
 * They come from the server via /api/mcp-tools, /api/mcp-spec, and /api/openapi.
 */
import type { TokenScope } from '../../types';

export const SCOPE_LABELS: Record<TokenScope, string> = {
  read: 'Read',
  write: 'Write',
  admin: 'Admin',
  mcp: 'MCP',
};

export const SCOPE_OPTIONS: TokenScope[] = ['read', 'write', 'admin', 'mcp'];

export function buildMcpStreamableConfig(baseUrl: string) {
  return {
    mcpServers: {
      clawstash: {
        type: 'streamable-http',
        url: `${baseUrl}/mcp`,
        headers: {
          Authorization: 'Bearer YOUR_API_TOKEN',
        },
      },
    },
  };
}

/**
 * stdio MCP-server config snippet shown in the API tab.
 *
 * `cwd` is intentionally a placeholder — the running clawstash process
 * cannot reliably introspect the on-disk path the user is editing
 * (Docker, packaged binaries, dev sandboxes all differ). The literal
 * angle-bracket placeholder makes it obvious in the copied snippet
 * that the user MUST replace it before the config will work.
 *
 * UI also surfaces a hint next to the snippet (BACKLOG #101).
 */
export const MCP_STDIO_CWD_PLACEHOLDER = '<ABSOLUTE_PATH_TO_CLAWSTASH_REPO>';

/**
 * Entry point of the stdio MCP server, relative to the repo root. Must match
 * the `mcp` script in package.json (`tsx src/server/mcp.ts`) — a drifted path
 * here ships a copy-paste config that fails with "Cannot find module".
 */
export const MCP_STDIO_ENTRY = 'src/server/mcp.ts';

export function buildMcpStdioConfig() {
  return {
    mcpServers: {
      clawstash: {
        command: 'npx',
        args: ['tsx', MCP_STDIO_ENTRY],
        cwd: MCP_STDIO_CWD_PLACEHOLDER,
      },
    },
  };
}

/**
 * Build REST API spec text for "Copy for AI" from the OpenAPI JSON.
 * Derives the endpoint summary directly from the OpenAPI spec — no hardcoded list.
 */
export function getRestConfigText(baseUrl: string, openApiJson?: string): string {
  let endpointsText = '';

  if (openApiJson) {
    try {
      const spec = JSON.parse(openApiJson);
      const paths = spec.paths || {};
      const sections = new Map<string, string[]>();

      for (const [path, methods] of Object.entries(paths)) {
        for (const [method, details] of Object.entries(
          methods as Record<string, { summary?: string; tags?: string[] }>,
        )) {
          const tag = details.tags?.[0] || 'Other';
          if (!sections.has(tag)) sections.set(tag, []);
          const methodUpper = method.toUpperCase().padEnd(6);
          const fullPath = `${baseUrl}${path}`;
          sections
            .get(tag)!
            .push(`${methodUpper} ${fullPath.padEnd(50)} - ${details.summary || ''}`);
        }
      }

      endpointsText = Array.from(sections.entries())
        .map(([section, endpoints]) => `### ${section}\n${endpoints.join('\n')}`)
        .join('\n\n');
    } catch {
      // Fallback: just include the raw JSON
    }
  }

  let text = `# ClawStash REST API

## Base URL
${baseUrl}

## Authentication
Bearer Token via Authorization header:
  Authorization: Bearer <your-token>

Token scopes: ${SCOPE_OPTIONS.join(', ')}`;

  if (endpointsText) {
    text += `\n\n## Endpoints\n\n${endpointsText}`;
  }

  if (openApiJson) {
    text += `

## OpenAPI 3.0 Specification
Full machine-readable API schema with all endpoints, request/response types, and data models.

\`\`\`json
${openApiJson}
\`\`\``;
  }

  return text;
}
