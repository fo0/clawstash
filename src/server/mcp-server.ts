import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { allScopes, hasScope } from './auth';
import type { ClawStashDB, TokenScope } from './db';
import { getOpenApiSpec } from './openapi';
import { getMcpSpecText, getMcpRefreshText, getMcpOnboardingText } from './mcp-spec';
import { getAgentSkillText, getMcpInstructionsText } from './agent-guide';
import { buildServerInfo } from './server-info';
import { getToolDef } from './tool-defs';
import type { ToolDef, ToolName } from './tool-defs';
import { checkVersion } from './version';

/**
 * Who is calling this MCP server.
 *
 * `POST /mcp` gates on the `mcp` scope, but that scope is a TRANSPORT gate —
 * "this token may speak MCP" — not a capability grant. The scopes the caller
 * actually holds have to reach the tools, otherwise the MCP transport is a
 * privilege-escalation path around the REST scope checks: an `mcp`-only token
 * could create, update, archive and delete stashes here while every REST
 * write route rejects it for a missing `write` scope.
 *
 * Required (not optional) on purpose: a new call site cannot forget to decide
 * what its caller is allowed to do.
 */
export interface McpAuthContext {
  /**
   * Scopes granted to the caller, as resolved by `server/auth.ts`.
   *
   * `readonly` on BOTH the property and the array: `LOCAL_STDIO_AUTH` below is
   * a shared module singleton, and without the property modifier
   * `LOCAL_STDIO_AUTH.scopes = []` (or `= ['admin']`) type-checks and silently
   * re-authorizes every stdio server in the process.
   */
  readonly scopes: readonly TokenScope[];
}

/**
 * Auth context for the stdio transport (`npm run mcp`, `src/server/mcp.ts`).
 *
 * stdio carries no per-request credentials: the MCP client spawns the server
 * as a local child process with the operator's own privileges and talks to it
 * over the process's stdin/stdout — there is no network boundary and no token
 * to check. It therefore keeps the full scope set it has always had; gating it
 * would break every local stdio setup without closing any attack surface.
 *
 * Deep-frozen because it is a shared module singleton: `allScopes()` hands out
 * a fresh array precisely "so callers can mutate without poisoning the shared
 * constant" (see `auth.ts`), and a full-trust constant that any importer could
 * mutate would reintroduce exactly that hazard one level up.
 *
 * NOT exported: `createLocalStdioMcpServer()` below is the only door to it, so
 * an HTTP path cannot import full local trust and hand it to `createMcpServer`
 * (BACKLOG #149).
 */
const LOCAL_STDIO_AUTH: McpAuthContext = Object.freeze({
  scopes: Object.freeze(allScopes()),
});

/**
 * The single door to a full-trust MCP server: the locally spawned stdio process.
 *
 * Takes no auth argument on purpose. While `LOCAL_STDIO_AUTH` was exported,
 * nothing mechanical stopped a future request-served module from writing
 * `createMcpServer(db, baseUrl, LOCAL_STDIO_AUTH)` and silently undoing the MCP
 * scope gate — the guard against it was a test that greps `src/app/**` for the
 * identifier. With the constant module-private, an HTTP path has no way to
 * reach full trust: it can only call `createMcpServer` and must pass the scopes
 * its own caller actually holds.
 *
 * No `baseUrl`: stdio has no request to derive one from, so `createMcpServer`
 * falls back to the local port for the spec-emitting tools, exactly as before.
 */
export function createLocalStdioMcpServer(db: ClawStashDB): McpServer {
  return createMcpServer(db, undefined, LOCAL_STDIO_AUTH);
}

/** Tool handler shape. Args are validated against the tool's Zod schema by the SDK. */
type ToolHandler = (args: Record<string, any>) => Promise<CallToolResult>;

/**
 * Result for a call the caller's scopes do not cover.
 *
 * Shaped like every other tool failure — a text content block plus
 * `isError: true` — so it crosses the transport as a normal MCP tool error
 * instead of an exception. Names the missing scope so an agent can act on it.
 */
function insufficientScopeResult(def: ToolDef): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text:
          `Error: Tool "${def.name}" requires the "${def.scope}" scope. ` +
          `This token is authorized for the MCP transport (scope "mcp") but not for ` +
          `"${def.scope}" operations. The "mcp" scope only permits connecting to the MCP ` +
          `endpoint — issue a token that also carries "${def.scope}" (see GET /api/mcp-onboarding).`,
      },
    ],
    isError: true,
  };
}

export function createMcpServer(
  db: ClawStashDB,
  baseUrl: string | undefined,
  auth: McpAuthContext,
): McpServer {
  // Fallback used by spec-emitting tools when the MCP server is constructed
  // without a request-derived base URL (e.g. stdio transport).
  const fallbackBaseUrl = baseUrl || `http://localhost:${process.env.PORT || '3000'}`;

  // `instructions` is the MCP-native channel for guidance: clients hand it to
  // the model on `initialize` (Claude Code, Cursor and others put it into the
  // system prompt), so an agent knows how to use this instance before its
  // first tool call. Kept compact on purpose — it lives in the agent's context
  // for the whole session; the long form is the SKILL.md resource below.
  const server = new McpServer(
    {
      name: 'clawstash',
      version: '1.0.0',
      description:
        'ClawStash — persistent, searchable storage for AI agents: stashes of text files with name, description, tags and metadata.',
    },
    { instructions: getMcpInstructionsText(fallbackBaseUrl) },
  );

  // Guides as MCP resources, for clients that surface resources to the model
  // or let the user attach them. Static URIs; the REST twins are unauthenticated.
  server.registerResource(
    'clawstash-skill',
    'clawstash://guide/skill',
    {
      title: 'ClawStash SKILL.md',
      description:
        'Compact operational guide for agents: when to store, workflow, conventions, limits, errors, maintenance. Same text as GET /api/agent-skill.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'text/markdown', text: getAgentSkillText(fallbackBaseUrl) },
      ],
    }),
  );
  server.registerResource(
    'clawstash-onboarding',
    'clawstash://guide/onboarding',
    {
      title: 'ClawStash MCP onboarding guide',
      description:
        'The skill plus the complete MCP specification (every tool with its JSON Schema, data types). Same text as GET /api/mcp-onboarding.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/markdown',
          text: getMcpOnboardingText(fallbackBaseUrl),
        },
      ],
    }),
  );

  // Convention: a tool result that reports a failure MUST carry
  // `isError: true`. Without it the MCP spec says the call succeeded, so a
  // client has to string-match the text to notice — and an agent will happily
  // treat `Error: Stash "…" not found.` as a valid answer.

  /**
   * Register a tool, gated on the scope its definition declares.
   *
   * The ONLY way tools are registered here — the scope check therefore cannot
   * be forgotten by a new tool, and it cannot drift per tool either: the
   * required scope is declared once in `tool-defs.ts` (the same source of
   * truth that feeds the OpenAPI spec, the MCP spec and the frontend tool
   * list) and enforced once here, using the ladder from `server/auth.ts`.
   */
  const register = (name: ToolName, handler: ToolHandler): void => {
    const def = getToolDef(name);
    server.registerTool(
      def.name,
      { description: def.description, inputSchema: def.schema.shape },
      async (args: Record<string, any>) => {
        if (def.scope !== 'none' && !hasScope(auth.scopes, def.scope)) {
          return insufficientScopeResult(def);
        }
        return handler(args);
      },
    );
  };

  // Create a new stash
  register('create_stash', async ({ name, description, files, tags, metadata }) => {
    const stash = db.createStash({ name, description, files, tags, metadata });
    db.logAccess(stash.id, 'mcp', 'create');
    const fileInfos = stash.files.map((f) => ({
      filename: f.filename,
      language: f.language,
      size: f.content.length,
    }));
    const summary = {
      id: stash.id,
      name: stash.name,
      description: stash.description,
      tags: stash.tags,
      archived: stash.archived,
      metadata: stash.metadata,
      total_size: fileInfos.reduce((sum, f) => sum + f.size, 0),
      files: fileInfos,
      version: stash.version,
      created_at: stash.created_at,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  });

  // Read a stash by ID (metadata + file list by default, optionally with content)
  register('read_stash', async ({ id, include_content }) => {
    if (include_content) {
      const stash = db.getStash(id);
      if (!stash) {
        return {
          content: [{ type: 'text', text: `Error: Stash "${id}" not found.` }],
          isError: true,
        };
      }
      db.logAccess(stash.id, 'mcp', 'read');
      const result = {
        id: stash.id,
        name: stash.name,
        description: stash.description,
        tags: stash.tags,
        archived: stash.archived,
        metadata: stash.metadata,
        version: stash.version,
        created_at: stash.created_at,
        updated_at: stash.updated_at,
        total_size: stash.files.reduce((sum, f) => sum + f.content.length, 0),
        files: stash.files.map((f) => ({
          filename: f.filename,
          language: f.language,
          size: f.content.length,
          content: f.content,
        })),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }

    const meta = db.getStashMeta(id);
    if (!meta) {
      return {
        content: [{ type: 'text', text: `Error: Stash "${id}" not found.` }],
        isError: true,
      };
    }
    db.logAccess(meta.id, 'mcp', 'read');
    return {
      content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }],
    };
  });

  // Read a single file from a stash
  register('read_stash_file', async ({ id, filename }) => {
    const file = db.getStashFile(id, filename);
    if (file) {
      db.logAccess(id, 'mcp', `read_file:${filename}`);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                filename: file.filename,
                language: file.language,
                size: file.content.length,
                content: file.content,
              },
              null,
              2,
            ),
          },
        ],
      };
    }
    // File not found — check if stash exists to provide the right error
    const stashMeta = db.getStashMeta(id);
    if (!stashMeta) {
      return {
        content: [{ type: 'text', text: `Error: Stash "${id}" not found.` }],
        isError: true,
      };
    }
    const available = stashMeta.files.map((f) => f.filename).join(', ');
    return {
      content: [
        {
          type: 'text',
          text: `Error: File "${filename}" not found in stash "${id}". Available files: ${available}`,
        },
      ],
      isError: true,
    };
  });

  // List stashes with optional filtering.
  // When a search query is given, route to FTS5 ranked search to match REST
  // /api/stashes behavior — otherwise MCP clients silently get a slower,
  // unranked LIKE scan with different result ordering than the REST endpoint.
  register('list_stashes', async ({ search, tag, archived, page, limit }) => {
    const result = search
      ? db.searchStashes(search, { tag, archived, page, limit })
      : db.listStashes({ tag, archived, page, limit });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  // Update a stash
  register('update_stash', async ({ id, name, description, files, tags, metadata }) => {
    const stash = db.updateStash(id, { name, description, files, tags, metadata }, 'mcp');
    if (!stash) {
      return {
        content: [{ type: 'text', text: `Error: Stash "${id}" not found.` }],
        isError: true,
      };
    }
    db.logAccess(stash.id, 'mcp', 'update');
    const fileInfos = stash.files.map((f) => ({
      filename: f.filename,
      language: f.language,
      size: f.content.length,
    }));
    const summary = {
      id: stash.id,
      name: stash.name,
      description: stash.description,
      tags: stash.tags,
      archived: stash.archived,
      metadata: stash.metadata,
      total_size: fileInfos.reduce((sum, f) => sum + f.size, 0),
      files: fileInfos,
      version: stash.version,
      updated_at: stash.updated_at,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  });

  // Delete a stash
  // No logAccess: access_log has ON DELETE CASCADE, so entries are removed with
  // the stash. The deletion is recorded in the non-cascading deletion_audit
  // table instead (BACKLOG #42).
  register('delete_stash', async ({ id }) => {
    const deleted = db.deleteStash(id, { source: 'mcp' });
    if (!deleted) {
      return {
        content: [{ type: 'text', text: `Error: Stash "${id}" not found.` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: `Stash "${id}" deleted successfully.` }] };
  });

  // Archive / unarchive a stash
  register('archive_stash', async ({ id, archived }) => {
    const stash = db.archiveStash(id, archived);
    if (!stash) {
      return {
        content: [{ type: 'text', text: `Error: Stash "${id}" not found.` }],
        isError: true,
      };
    }
    db.logAccess(stash.id, 'mcp', archived ? 'archive' : 'unarchive');
    const summary = {
      id: stash.id,
      name: stash.name,
      archived: stash.archived,
      updated_at: stash.updated_at,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
    };
  });

  // Search stashes (FTS5 with BM25 ranking + snippets)
  register('search_stashes', async ({ query, tag, archived, limit, page }) => {
    // clampPagination() inside searchStashes already defaults limit to 20.
    const result = db.searchStashes(query, { tag, archived, limit, page });
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  });

  // List tags
  register('list_tags', async () => {
    const tags = db.getAllTags();
    return {
      content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }],
    };
  });

  // Get tag graph
  register('get_tag_graph', async ({ tag, depth, min_weight, min_count, limit }) => {
    const graph = db.getTagGraph({ tag, depth, min_weight, min_count, limit });
    return {
      content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }],
    };
  });

  // Get stats
  register('get_stats', async () => {
    const stats = db.getStats();
    return {
      content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
    };
  });

  // Get REST API spec (OpenAPI)
  register('get_rest_api_spec', async () => {
    const spec = getOpenApiSpec(fallbackBaseUrl);
    return {
      content: [{ type: 'text', text: JSON.stringify(spec, null, 2) }],
    };
  });

  // Get MCP spec
  register('get_mcp_spec', async () => {
    const spec = getMcpSpecText(fallbackBaseUrl);
    return {
      content: [{ type: 'text', text: spec }],
    };
  });

  // Refresh tools — current spec for already-connected AI agents to stay up-to-date
  register('refresh_tools', async () => {
    const text = getMcpRefreshText(fallbackBaseUrl);
    return {
      content: [{ type: 'text', text }],
    };
  });

  // Check version (current + latest from GitHub)
  register('check_version', async () => {
    const info = await checkVersion();
    return {
      content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
    };
  });

  // Server info — the one call an agent makes first. Self-description only
  // (scope 'none'), but the build fingerprint follows the same rule as
  // /api/version and check_version: it is withheld unless the caller holds
  // `read`, so an mcp-only token learns which tools it may call, not which
  // commit is deployed.
  register('get_server_info', async () => {
    const info = buildServerInfo(auth, fallbackBaseUrl, baseUrl ? 'streamable-http' : 'stdio');
    return {
      content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
    };
  });

  return server;
}
