/**
 * MCP Tool Definitions — Single source of truth.
 *
 * All tool names, descriptions, Zod schemas, and return type descriptions
 * are defined here ONCE. Consumed by:
 * - server/mcp-server.ts  → server.tool() registration (Zod schemas + descriptions)
 * - server/mcp-spec.ts    → MCP spec generation (Zod → JSON Schema via zodToJsonSchema)
 * - /api/mcp-tools        → Frontend tool list endpoint
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

export const FileInputSchema = z.object({
  filename: z.string().describe('Filename with extension (e.g. "main.py", "config.json"). Extension is used for language detection.'),
  content: z.string().describe('The full file content as text'),
  language: z.string().optional().describe('Programming language override (auto-detected from extension if omitted)'),
});

// ---------------------------------------------------------------------------
// Tool definition type
// ---------------------------------------------------------------------------

export interface ToolDef<T extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  schema: z.ZodObject<T>;
  returns: string;
}

// ---------------------------------------------------------------------------
// All tool definitions
// ---------------------------------------------------------------------------

export const TOOL_DEFS = [
  {
    name: 'create_stash',
    description: `Create a new stash with one or more files.

Returns a confirmation with the stash ID and file list (no echoed content, to save tokens).
Use read_stash or read_stash_file afterwards if you need to verify stored content.

Tips:
- Set a descriptive 'name' and 'description' so the stash is easy to find later via search.
- Use tags for categorization (e.g. ["python", "config", "project-x"]).
- Use metadata for structured key-value data (e.g. {"model": "claude", "purpose": "backup"}).
- Language is auto-detected from file extension if omitted.`,
    schema: z.object({
      name: z.string().optional().describe('Short name/title for the stash (used in listings and search)'),
      description: z.string().optional().describe('Longer description explaining the stash content and purpose (searchable)'),
      files: z
        .array(FileInputSchema)
        .min(1)
        .describe('One or more files to store. Each file needs a filename and content.'),
      tags: z.array(z.string()).optional().describe('Tags for categorization and filtering. Use list_tags to see existing tags.'),
      metadata: z
        .record(z.unknown())
        .optional()
        .describe('Arbitrary key-value metadata (e.g. {"model": "claude", "agent_id": "abc", "purpose": "code review"})'),
    }),
    returns: '{ id, name, description, tags, metadata, total_size, files: [{ filename, language, size }], created_at }',
  },
  {
    name: 'read_stash',
    description: `Retrieve a stash by ID. Returns stash metadata, tags, and a file list with sizes.

By default, file content is NOT included to save tokens. The response includes:
- Stash metadata (name, description, tags, metadata)
- total_size: sum of all file sizes in characters (use this to decide if include_content=true is feasible)
- files: list with filename, language, and size per file

To get file content:
- For specific files: use read_stash_file (recommended, most token-efficient).
- For all files at once: set include_content=true (only recommended when total_size is small, e.g. < 10000 characters).`,
    schema: z.object({
      id: z.string().describe('The stash ID (UUID format)'),
      include_content: z.boolean().optional().describe('If true, includes full file content in response. Default: false (returns file list with sizes only). Use read_stash_file for selective access.'),
    }),
    returns: '{ id, name, description, tags, metadata, created_at, updated_at, total_size, files: [{ filename, language, size, content? }] }',
  },
  {
    name: 'read_stash_file',
    description: `Read the content of a specific file within a stash. This is the most token-efficient way to access file content.

Use read_stash first (without include_content) to see the file list, then use this tool to read only the files you need.

Returns the file content as text along with filename and language metadata.`,
    schema: z.object({
      id: z.string().describe('The stash ID (UUID format)'),
      filename: z.string().describe('Exact filename to read (as shown in the file list from read_stash or list_stashes)'),
    }),
    returns: '{ filename, language, size, content }',
  },
  {
    name: 'list_stashes',
    description: `List stashes with optional filtering. Returns summaries only (name, description, tags, file names with sizes) — no file content or metadata.

Results are paginated (default: 50 per page). Use the 'total' field in the response to determine if more pages are available.

To get full details for a specific stash, use read_stash with its ID.
To read file content, use read_stash_file.
To search by text content, use search_stashes.

File sizes (character counts) are included to help estimate content volume before reading.`,
    schema: z.object({
      search: z.string().optional().describe('Filter by name, description, filename, or file content (case-insensitive partial match)'),
      tag: z.string().optional().describe('Filter by tag (exact match). Use list_tags to see available tags.'),
      page: z.number().optional().describe('Page number for pagination (default: 1)'),
      limit: z.number().optional().describe('Results per page (default: 50, max recommended: 100)'),
    }),
    returns: '{ stashes: StashListItem[], total: number }',
  },
  {
    name: 'update_stash',
    description: `Update an existing stash. Only fields you provide will be changed — omitted fields remain unchanged.

Returns a confirmation with updated metadata (no echoed file content, to save tokens).
Use read_stash or read_stash_file afterwards if you need to verify changes.

Important:
- 'files' replaces ALL existing files (not a partial update). Include all files you want to keep.
- 'tags' replaces the entire tag list.
- 'metadata' replaces the entire metadata object.
- To update only name/description, omit files/tags/metadata.`,
    schema: z.object({
      id: z.string().describe('The stash ID to update'),
      name: z.string().optional().describe('New name/title'),
      description: z.string().optional().describe('New description'),
      files: z
        .array(FileInputSchema)
        .optional()
        .describe('Replacement files — replaces ALL existing files. Omit to keep current files unchanged.'),
      tags: z.array(z.string()).optional().describe('New tags — replaces entire tag list. Omit to keep current tags.'),
      metadata: z.record(z.unknown()).optional().describe('New metadata — replaces entire metadata object. Omit to keep current metadata.'),
    }),
    returns: '{ id, name, description, tags, metadata, total_size, files: [{ filename, language, size }], updated_at }',
  },
  {
    name: 'delete_stash',
    description: `Permanently delete a stash and all its files. This action cannot be undone.`,
    schema: z.object({
      id: z.string().describe('The stash ID to delete'),
    }),
    returns: 'Success message string',
  },
  {
    name: 'search_stashes',
    description: `Full-text search across stash names, descriptions, filenames, and file content. Returns matching stash summaries (no file content).

This is the best tool for finding stashes when you don't know the ID. The search is case-insensitive and matches partial strings.

Results include file names with sizes so you can decide which stashes and files to read in detail.
Use read_stash to get full stash metadata, or read_stash_file to read specific file content.`,
    schema: z.object({
      query: z.string().describe('Search text (matches against name, description, filenames, and file content)'),
      limit: z.number().optional().describe('Maximum number of results (default: 20)'),
    }),
    returns: '{ stashes: StashListItem[], total: number }',
  },
  {
    name: 'list_tags',
    description: `List all tags that are currently in use, with the number of stashes using each tag. Useful for discovering available categories before filtering with list_stashes.`,
    schema: z.object({}),
    returns: '[{ tag: string, count: number }]',
  },
  {
    name: 'get_tag_graph',
    description: `Get the tag relationship graph: tags as nodes (with usage counts) and co-occurrence edges (tags that appear together on the same stash).

Returns:
- nodes: array of {tag, count} — each tag and how many stashes use it, sorted by count descending.
- edges: array of {source, target, weight} — pairs of tags that co-occur, with weight = number of stashes sharing both tags, sorted by weight descending.
- stash_count: total number of stashes analyzed.
- filter: present when tag parameter was used, shows the applied focus tag and depth.

Incremental exploration strategy for large graphs:
1. Call with no params first to get a high-level overview (or use min_count/limit to reduce).
2. Pick an interesting tag and call with tag="..." depth=1 to see its direct neighbors.
3. Increase depth=2 or depth=3 to explore deeper into that cluster.
4. Use min_weight to filter out weak connections and focus on strong relationships.
5. Use list_stashes(tag=...) to read actual stash content once you've identified relevant tags.`,
    schema: z.object({
      tag: z.string().optional().describe('Focus tag: only return this tag and its neighbors within the specified depth. Omit for the full graph.'),
      depth: z.number().optional().describe('Traversal depth from the focus tag (default: 1, max: 5). Depth 1 = direct neighbors, 2 = neighbors of neighbors, etc. Only used with tag parameter.'),
      min_weight: z.number().optional().describe('Minimum edge weight (co-occurrence count) to include. Filters out weak connections.'),
      min_count: z.number().optional().describe('Minimum tag usage count to include nodes. Filters out rarely-used tags.'),
      limit: z.number().optional().describe('Maximum number of tag nodes to return (sorted by count descending). Useful for getting only the most-used tags.'),
    }),
    returns: '{ nodes: [{ tag, count }], edges: [{ source, target, weight }], stash_count, filter? }',
  },
  {
    name: 'get_stats',
    description: `Get storage statistics: total stashes, total files, and top programming languages. Useful for getting an overview of what's stored.`,
    schema: z.object({}),
    returns: '{ totalStashes: number, totalFiles: number, topLanguages: [{ language: string, count: number }] }',
  },
  {
    name: 'get_rest_api_spec',
    description: `Get the full OpenAPI 3.0 specification for the ClawStash REST API.

Returns the complete API schema as JSON, including all endpoints, request/response schemas, and authentication details.
Use this to understand the REST API capabilities and integrate programmatically.`,
    schema: z.object({}),
    returns: 'OpenAPI 3.0 JSON specification object',
  },
  {
    name: 'get_mcp_spec',
    description: `Get the full MCP (Model Context Protocol) specification for ClawStash.

Returns a comprehensive markdown document with all tool definitions, input schemas, return types, data types, connection details, and token-efficient usage patterns.
Use this to understand all available MCP tools and how to use them optimally.`,
    schema: z.object({}),
    returns: 'Markdown text with full MCP specification',
  },
  {
    name: 'onboard',
    description: `Self-onboarding tool — returns the full ClawStash MCP onboarding guide.

Call this tool when you first connect to learn all available tools, their schemas, data types, connection details, and recommended workflows.
Call it again periodically to refresh your knowledge — tool definitions and capabilities may change over time.

The response includes:
- Quick start instructions (endpoint, auth, first steps)
- Recommended workflow for discovering and accessing stashes
- Complete tool reference with input schemas and return types
- Data type definitions
- Token-efficient usage patterns`,
    schema: z.object({}),
    returns: 'Markdown text with full MCP onboarding guide and specification',
  },
] satisfies ToolDef[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tool names as a union type. */
export type ToolName = (typeof TOOL_DEFS)[number]['name'];

/** Get a specific tool definition by name. Throws if the name is not a valid tool. */
export function getToolDef(name: ToolName): ToolDef {
  const def = TOOL_DEFS.find(t => t.name === name);
  if (!def) throw new Error(`Unknown tool: ${name}`);
  return def;
}

/** Get a summary list of all tools (name + first line of description) for the /api/mcp-tools endpoint. */
export function getToolSummaries(): Array<{ name: string; description: string }> {
  return TOOL_DEFS.map(t => ({
    name: t.name,
    description: t.description.split('\n')[0],
  }));
}
