import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ClawStashDB } from './db.js';
import { getOpenApiSpec } from './openapi.js';
import { getMcpSpecText } from './mcp-spec.js';
import { TOKEN_EFFICIENT_GUIDE } from './shared-text.js';
import { getToolDef } from './tool-defs.js';

export function createMcpServer(db: ClawStashDB, baseUrl?: string): McpServer {
  const server = new McpServer({
    name: 'clawstash',
    version: '1.0.0',
    description: `ClawStash – AI-optimized stash storage. Stores text and files with name, description, tags, and metadata.

## Token-efficient usage guide for AI clients

${TOKEN_EFFICIENT_GUIDE}`,
  });

  // Create a new stash
  const createDef = getToolDef('create_stash');
  server.tool(
    createDef.name,
    createDef.description,
    createDef.schema.shape,
    async ({ name, description, files, tags, metadata }) => {
      const stash = db.createStash({ name, description, files, tags, metadata });
      db.logAccess(stash.id, 'mcp', 'create');
      const fileInfos = stash.files.map(f => ({ filename: f.filename, language: f.language, size: f.content.length }));
      const summary = {
        id: stash.id,
        name: stash.name,
        description: stash.description,
        tags: stash.tags,
        metadata: stash.metadata,
        total_size: fileInfos.reduce((sum, f) => sum + f.size, 0),
        files: fileInfos,
        created_at: stash.created_at,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

  // Read a stash by ID (metadata + file list by default, optionally with content)
  const readDef = getToolDef('read_stash');
  server.tool(
    readDef.name,
    readDef.description,
    readDef.schema.shape,
    async ({ id, include_content }) => {
      if (include_content) {
        const stash = db.getStash(id);
        if (!stash) {
          return { content: [{ type: 'text', text: `Error: Stash "${id}" not found.` }] };
        }
        db.logAccess(stash.id, 'mcp', 'read');
        const result = {
          id: stash.id,
          name: stash.name,
          description: stash.description,
          tags: stash.tags,
          metadata: stash.metadata,
          created_at: stash.created_at,
          updated_at: stash.updated_at,
          total_size: stash.files.reduce((sum, f) => sum + f.content.length, 0),
          files: stash.files.map(f => ({ filename: f.filename, language: f.language, size: f.content.length, content: f.content })),
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      const meta = db.getStashMeta(id);
      if (!meta) {
        return { content: [{ type: 'text', text: `Error: Stash "${id}" not found.` }] };
      }
      db.logAccess(meta.id, 'mcp', 'read');
      return {
        content: [{ type: 'text', text: JSON.stringify(meta, null, 2) }],
      };
    }
  );

  // Read a single file from a stash
  const readFileDef = getToolDef('read_stash_file');
  server.tool(
    readFileDef.name,
    readFileDef.description,
    readFileDef.schema.shape,
    async ({ id, filename }) => {
      const file = db.getStashFile(id, filename);
      if (file) {
        db.logAccess(id, 'mcp', `read_file:${filename}`);
        return {
          content: [{ type: 'text', text: JSON.stringify({ filename: file.filename, language: file.language, size: file.content.length, content: file.content }, null, 2) }],
        };
      }
      // File not found — check if stash exists to provide the right error
      const stashMeta = db.getStashMeta(id);
      if (!stashMeta) {
        return { content: [{ type: 'text', text: `Error: Stash "${id}" not found.` }] };
      }
      const available = stashMeta.files.map(f => f.filename).join(', ');
      return { content: [{ type: 'text', text: `Error: File "${filename}" not found in stash "${id}". Available files: ${available}` }] };
    }
  );

  // List stashes with optional filtering
  const listDef = getToolDef('list_stashes');
  server.tool(
    listDef.name,
    listDef.description,
    listDef.schema.shape,
    async ({ search, tag, page, limit }) => {
      const result = db.listStashes({ search, tag, page, limit });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // Update a stash
  const updateDef = getToolDef('update_stash');
  server.tool(
    updateDef.name,
    updateDef.description,
    updateDef.schema.shape,
    async ({ id, name, description, files, tags, metadata }) => {
      const stash = db.updateStash(id, { name, description, files, tags, metadata }, 'mcp');
      if (!stash) {
        return { content: [{ type: 'text', text: `Error: Stash "${id}" not found.` }] };
      }
      db.logAccess(stash.id, 'mcp', 'update');
      const fileInfos = stash.files.map(f => ({ filename: f.filename, language: f.language, size: f.content.length }));
      const summary = {
        id: stash.id,
        name: stash.name,
        description: stash.description,
        tags: stash.tags,
        metadata: stash.metadata,
        total_size: fileInfos.reduce((sum, f) => sum + f.size, 0),
        files: fileInfos,
        updated_at: stash.updated_at,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      };
    }
  );

  // Delete a stash
  const deleteDef = getToolDef('delete_stash');
  server.tool(
    deleteDef.name,
    deleteDef.description,
    deleteDef.schema.shape,
    async ({ id }) => {
      const deleted = db.deleteStash(id);
      if (!deleted) {
        return { content: [{ type: 'text', text: `Error: Stash "${id}" not found.` }] };
      }
      return { content: [{ type: 'text', text: `Stash "${id}" deleted successfully.` }] };
    }
  );

  // Search stashes
  const searchDef = getToolDef('search_stashes');
  server.tool(
    searchDef.name,
    searchDef.description,
    searchDef.schema.shape,
    async ({ query, limit }) => {
      const result = db.listStashes({ search: query, limit: limit || 20 });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  // List tags
  const tagsDef = getToolDef('list_tags');
  server.tool(
    tagsDef.name,
    tagsDef.description,
    tagsDef.schema.shape,
    async () => {
      const tags = db.getAllTags();
      return {
        content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }],
      };
    }
  );

  // Get tag graph
  const graphDef = getToolDef('get_tag_graph');
  server.tool(
    graphDef.name,
    graphDef.description,
    graphDef.schema.shape,
    async ({ tag, depth, min_weight, min_count, limit }) => {
      const graph = db.getTagGraph({ tag, depth, min_weight, min_count, limit });
      return {
        content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }],
      };
    }
  );

  // Get stats
  const statsDef = getToolDef('get_stats');
  server.tool(
    statsDef.name,
    statsDef.description,
    statsDef.schema.shape,
    async () => {
      const stats = db.getStats();
      return {
        content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }],
      };
    }
  );

  // Get REST API spec (OpenAPI)
  const restSpecDef = getToolDef('get_rest_api_spec');
  server.tool(
    restSpecDef.name,
    restSpecDef.description,
    restSpecDef.schema.shape,
    async () => {
      const spec = getOpenApiSpec(baseUrl || `http://localhost:${process.env.PORT || '3001'}`);
      return {
        content: [{ type: 'text', text: JSON.stringify(spec, null, 2) }],
      };
    }
  );

  // Get MCP spec
  const mcpSpecDef = getToolDef('get_mcp_spec');
  server.tool(
    mcpSpecDef.name,
    mcpSpecDef.description,
    mcpSpecDef.schema.shape,
    async () => {
      const spec = getMcpSpecText(baseUrl || `http://localhost:${process.env.PORT || '3001'}`);
      return {
        content: [{ type: 'text', text: spec }],
      };
    }
  );

  return server;
}
