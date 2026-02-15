import { CLAWSTASH_PURPOSE_PLAIN } from './shared-text.js';

export interface OpenApiSpec {
  openapi: string;
  info: { title: string; description: string; version: string };
  servers: Array<{ url: string; description: string }>;
  components: {
    securitySchemes: Record<string, unknown>;
    schemas: Record<string, Record<string, unknown>>;
  };
  paths: Record<string, unknown>;
  tags: Array<{ name: string; description: string }>;
}

const specCache = new Map<string, OpenApiSpec>();

export function getOpenApiSpec(baseUrl: string): OpenApiSpec {
  const cached = specCache.get(baseUrl);
  if (cached) return cached;

  const spec: OpenApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'ClawStash API',
      description: CLAWSTASH_PURPOSE_PLAIN,
      version: '1.0.0',
    },
    servers: [
      { url: baseUrl, description: 'Current server' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API Token (cs_...) or Admin Token',
        },
      },
      schemas: {
        StashFile: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            stash_id: { type: 'string', format: 'uuid' },
            filename: { type: 'string' },
            content: { type: 'string' },
            language: { type: 'string' },
            sort_order: { type: 'integer' },
          },
        },
        Stash: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', description: 'Short name/title' },
            description: { type: 'string', description: 'Longer description for AI context' },
            tags: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object', additionalProperties: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            files: { type: 'array', items: { $ref: '#/components/schemas/StashFile' } },
          },
        },
        StashListItem: {
          type: 'object',
          description: 'Summary of a stash (no metadata or file content)',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            files: { type: 'array', items: { type: 'object', properties: { filename: { type: 'string' }, language: { type: 'string' } } } },
          },
        },
        CreateStashInput: {
          type: 'object',
          required: ['files'],
          properties: {
            name: { type: 'string', description: 'Short name/title' },
            description: { type: 'string', description: 'Longer description' },
            tags: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object', additionalProperties: true },
            files: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['filename'],
                properties: {
                  filename: { type: 'string' },
                  content: { type: 'string' },
                  language: { type: 'string' },
                },
              },
            },
          },
        },
        UpdateStashInput: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object', additionalProperties: true },
            files: {
              type: 'array',
              items: {
                type: 'object',
                required: ['filename'],
                properties: {
                  filename: { type: 'string' },
                  content: { type: 'string' },
                  language: { type: 'string' },
                },
              },
            },
          },
        },
        Stats: {
          type: 'object',
          properties: {
            totalStashes: { type: 'integer' },
            totalFiles: { type: 'integer' },
            topLanguages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  language: { type: 'string' },
                  count: { type: 'integer' },
                },
              },
            },
          },
        },
        TagGraph: {
          type: 'object',
          description: 'Tag relationship graph with nodes (tags) and co-occurrence edges',
          properties: {
            nodes: {
              type: 'array',
              description: 'Tags sorted by usage count (descending)',
              items: {
                type: 'object',
                properties: {
                  tag: { type: 'string', description: 'Tag name' },
                  count: { type: 'integer', description: 'Number of stashes using this tag' },
                },
              },
            },
            edges: {
              type: 'array',
              description: 'Co-occurrence edges between tags that appear on the same stash',
              items: {
                type: 'object',
                properties: {
                  source: { type: 'string', description: 'First tag name' },
                  target: { type: 'string', description: 'Second tag name' },
                  weight: { type: 'integer', description: 'Number of stashes sharing both tags' },
                },
              },
            },
            stash_count: { type: 'integer', description: 'Total number of stashes analyzed' },
            filter: {
              type: 'object',
              description: 'Present when tag filter was applied. Shows the focus tag and traversal depth used.',
              properties: {
                tag: { type: 'string', description: 'The focus tag that was filtered on' },
                depth: { type: 'integer', description: 'The traversal depth used' },
              },
            },
          },
        },
        AccessLogEntry: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            stash_id: { type: 'string', format: 'uuid' },
            source: { type: 'string', enum: ['api', 'mcp', 'ui'] },
            action: { type: 'string' },
            timestamp: { type: 'string', format: 'date-time' },
            ip: { type: 'string' },
            user_agent: { type: 'string' },
          },
        },
        VersionInfo: {
          type: 'object',
          description: 'Current build info and latest available version from GitHub',
          properties: {
            current: {
              type: 'object',
              description: 'Currently running build',
              properties: {
                version: { type: 'string', description: 'Date-based build version (e.g. "v20260215-1628")' },
                commit_sha: { type: 'string', description: 'Short commit hash of this build' },
                build_date: { type: 'string', format: 'date-time', description: 'Build timestamp (ISO 8601)' },
                branch: { type: 'string', description: 'Git branch this was built from' },
              },
            },
            latest: {
              type: 'object',
              nullable: true,
              description: 'Latest commit on the GitHub main branch (null if check failed)',
              properties: {
                commit_sha: { type: 'string', description: 'Short commit hash of the latest commit on main' },
                commit_date: { type: 'string', format: 'date-time', description: 'Commit date (ISO 8601)' },
                commit_message: { type: 'string', description: 'First line of the commit message' },
              },
            },
            update_available: { type: 'boolean', description: 'True if the latest commit SHA differs from the current build SHA' },
            github_url: { type: 'string', description: 'GitHub repository URL' },
            checked_at: { type: 'string', format: 'date-time', description: 'Timestamp of the last GitHub check' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    paths: {
      '/api/stashes': {
        get: {
          tags: ['Stashes'],
          summary: 'List stashes',
          description: 'Retrieve a paginated list of stashes with optional search and tag filters.',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search term (matches name, description, filenames, content)' },
            { name: 'tag', in: 'query', schema: { type: 'string' }, description: 'Filter by tag' },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 }, description: 'Results per page' },
          ],
          responses: {
            200: {
              description: 'List of stashes',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      stashes: { type: 'array', items: { $ref: '#/components/schemas/StashListItem' } },
                      total: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Stashes'],
          summary: 'Create a new stash',
          description: 'Create a new stash with one or more files. Supports tags and metadata.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CreateStashInput' },
              },
            },
          },
          responses: {
            201: {
              description: 'Created stash',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Stash' } } },
            },
            400: {
              description: 'Validation error',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
            },
          },
        },
      },
      '/api/stashes/stats': {
        get: {
          tags: ['Stashes'],
          summary: 'Get storage statistics',
          responses: {
            200: {
              description: 'Statistics',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Stats' } } },
            },
          },
        },
      },
      '/api/stashes/tags': {
        get: {
          tags: ['Stashes'],
          summary: 'List all tags with counts',
          responses: {
            200: {
              description: 'Tag list',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        tag: { type: 'string' },
                        count: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/stashes/metadata-keys': {
        get: {
          tags: ['Stashes'],
          summary: 'List all metadata keys',
          description: 'Returns all unique metadata keys used across all stashes.',
          responses: {
            200: {
              description: 'Array of metadata key strings',
              content: { 'application/json': { schema: { type: 'array', items: { type: 'string' } } } },
            },
          },
        },
      },
      '/api/stashes/graph': {
        get: {
          tags: ['Stashes'],
          summary: 'Get tag relationship graph',
          description: 'Returns tags as graph nodes with usage counts, and co-occurrence edges between tags that appear together on the same stash. Supports filtering by focus tag with depth traversal for incremental exploration. Without filters, returns the full graph.',
          parameters: [
            { name: 'tag', in: 'query', schema: { type: 'string' }, description: 'Focus tag: only return this tag and its neighbors within the specified depth' },
            { name: 'depth', in: 'query', schema: { type: 'integer', default: 1, minimum: 1, maximum: 5 }, description: 'Traversal depth from the focus tag (only used with tag parameter)' },
            { name: 'min_weight', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Minimum edge weight (co-occurrence count) to include' },
            { name: 'min_count', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Minimum tag usage count to include nodes' },
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 }, description: 'Maximum number of tag nodes to return (sorted by count descending)' },
          ],
          responses: {
            200: {
              description: 'Tag graph with nodes and edges',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/TagGraph' } } },
            },
          },
        },
      },
      '/api/stashes/{id}': {
        get: {
          tags: ['Stashes'],
          summary: 'Get a single stash',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Stash details', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stash' } } } },
            404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        patch: {
          tags: ['Stashes'],
          summary: 'Update a stash',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateStashInput' } } },
          },
          responses: {
            200: { description: 'Updated stash', content: { 'application/json': { schema: { $ref: '#/components/schemas/Stash' } } } },
            404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
        delete: {
          tags: ['Stashes'],
          summary: 'Delete a stash',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            204: { description: 'Deleted' },
            404: { description: 'Not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/api/stashes/{id}/files/{filename}/raw': {
        get: {
          tags: ['Stashes'],
          summary: 'Get raw file content',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'filename', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Raw file content', content: { 'text/plain': { schema: { type: 'string' } } } },
            404: { description: 'Not found' },
          },
        },
      },
      '/api/stashes/{id}/access-log': {
        get: {
          tags: ['Stashes'],
          summary: 'Get access log for a stash',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 }, description: 'Max entries to return' },
          ],
          responses: {
            200: {
              description: 'Access log entries',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/AccessLogEntry' } },
                },
              },
            },
            404: { description: 'Not found' },
          },
        },
      },
      '/api/tokens': {
        get: {
          tags: ['Tokens'],
          summary: 'List API tokens',
          description: 'Requires admin access. Returns token metadata (not the token values).',
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Token list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      tokens: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'string' },
                            label: { type: 'string' },
                            tokenPrefix: { type: 'string' },
                            scopes: { type: 'array', items: { type: 'string', enum: ['read', 'write', 'admin', 'mcp'] } },
                            createdAt: { type: 'string', format: 'date-time' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' },
          },
        },
        post: {
          tags: ['Tokens'],
          summary: 'Create an API token',
          description: 'Requires admin access. The token value is returned only once.',
          security: [{ bearerAuth: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: 'Token label (e.g. "Monitoring", "Claude Desktop")' },
                    scopes: {
                      type: 'array',
                      items: { type: 'string', enum: ['read', 'write', 'admin', 'mcp'] },
                      description: 'Token scopes',
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Created token (token value shown only once)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      token: { type: 'string', description: 'The full token value (shown only once)' },
                      label: { type: 'string' },
                      scopes: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
            400: { description: 'Validation error' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' },
          },
        },
      },
      '/api/tokens/{id}': {
        delete: {
          tags: ['Tokens'],
          summary: 'Delete an API token',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            204: { description: 'Deleted' },
            404: { description: 'Not found' },
          },
        },
      },
      '/api/tokens/validate': {
        post: {
          tags: ['Tokens'],
          summary: 'Validate a token',
          description: 'Check if the provided Bearer token is valid and return its scopes.',
          security: [{ bearerAuth: [] }],
          responses: {
            200: {
              description: 'Validation result',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      valid: { type: 'boolean' },
                      scopes: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/openapi': {
        get: {
          tags: ['System'],
          summary: 'Get OpenAPI schema',
          responses: {
            200: { description: 'OpenAPI 3.0 schema' },
          },
        },
      },
      '/api/mcp-spec': {
        get: {
          tags: ['System'],
          summary: 'Get MCP specification',
          description: 'Returns a comprehensive MCP specification as markdown text, including tool definitions with JSON Schema, data types, and usage patterns.',
          responses: {
            200: { description: 'MCP specification as text/plain (markdown)' },
          },
        },
      },
      '/api/mcp-onboarding': {
        get: {
          tags: ['System'],
          summary: 'MCP onboarding guide for AI self-onboarding',
          description: 'Returns the full MCP onboarding guide as markdown text. Includes quick start instructions, recommended workflows, and the complete MCP specification with all tool definitions, input schemas, return types, and data types. No authentication required — designed for AI agents to discover and onboard themselves. The equivalent MCP tool is `onboard`.',
          responses: {
            200: { description: 'MCP onboarding guide as text/plain (markdown)' },
          },
        },
      },
      '/api/version': {
        get: {
          tags: ['System'],
          summary: 'Check current version and available updates',
          description: 'Returns the running ClawStash version and checks GitHub for the latest available release. The latest version is fetched from GitHub releases (with fallback to tags) and cached for 1 hour. No authentication required.',
          responses: {
            200: {
              description: 'Version information',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/VersionInfo' },
                },
              },
            },
          },
        },
      },
      '/api/mcp-tools': {
        get: {
          tags: ['System'],
          summary: 'List MCP tool summaries',
          description: 'Returns a JSON array of all available MCP tools with name and short description. Derived from the same source as the MCP server tool definitions.',
          responses: {
            200: {
              description: 'Tool summaries',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string', description: 'Tool name' },
                        description: { type: 'string', description: 'Short description (first line)' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Stashes', description: 'Stash CRUD operations' },
      { name: 'Tokens', description: 'API token management' },
      { name: 'System', description: 'System endpoints' },
    ],
  };

  specCache.set(baseUrl, spec);
  return spec;
}
