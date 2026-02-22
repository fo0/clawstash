# MCP Integration

ClawStash implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) for direct AI agent integration. Any MCP-compatible client can connect — including OpenClaw, Claude Code, Cursor, and others.

## Setup

### Streamable HTTP (remote / network)

Add to your MCP client config:

```json
{
  "mcpServers": {
    "clawstash": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer cs_your_mcp_token"
      }
    }
  }
}
```

This works over the network — your ClawStash instance can run anywhere.

### stdio (local)

For local-only setups without network:

```json
{
  "mcpServers": {
    "clawstash": {
      "command": "npx",
      "args": ["tsx", "src/server/mcp.ts"],
      "cwd": "/path/to/clawstash"
    }
  }
}
```

> **Note:** Create an API token with the `mcp` scope in the web GUI under **Settings > API & Tokens**. When `ADMIN_PASSWORD` is not set, no token is needed.

## Available Tools

| Tool | Description |
|------|-------------|
| `create_stash` | Create a new stash with files, tags, metadata. Returns confirmation only. |
| `read_stash` | Get stash metadata + file list with sizes. Optional `include_content` for full content. |
| `read_stash_file` | Read a specific file's content from a stash (most token-efficient). |
| `list_stashes` | List/search stashes with filters. Returns summaries with file sizes (no content). |
| `update_stash` | Update an existing stash. Returns confirmation only. |
| `delete_stash` | Delete a stash. |
| `search_stashes` | Full-text search with BM25 ranking, Porter stemming, and match snippets. Supports tag filter. |
| `list_tags` | List all tags with usage counts. |
| `get_tag_graph` | Tag relationship graph with optional focus tag, depth, and filters. |
| `get_stats` | Storage statistics. |
| `get_rest_api_spec` | Full OpenAPI 3.0 REST API specification (JSON). |
| `get_mcp_spec` | Full MCP specification (markdown with tool schemas). |
| `refresh_tools` | Get current tool specs — useful for long-running agents to stay up-to-date. |
| `check_version` | Check current version and whether an update is available. |

## Token-Efficient Usage

The MCP tools are designed to minimize token consumption for AI agents:

```
1. list_stashes / search_stashes  →  summaries only (name, tags, file sizes)
2. read_stash                     →  metadata + file list with sizes (no content)
3. read_stash_file                →  single file content (only what you need)
4. read_stash(include_content)    →  full content (use only for small stashes)
```

Write operations (`create_stash`, `update_stash`) return confirmation summaries, not echoed content.

### Recommended Workflow

1. **Browse** — `list_stashes` to see what's available
2. **Search** — `search_stashes` to find specific content (returns ranked results with snippets)
3. **Inspect** — `read_stash` to see file list and metadata
4. **Read** — `read_stash_file` for individual files you need
5. **Modify** — `update_stash` to change content, tags, or metadata

## Self-Onboarding

ClawStash provides an onboarding endpoint for AI agents to bootstrap themselves:

```
GET http://localhost:3000/api/mcp-onboarding
```

This returns a complete text guide with all tools, schemas, data types, and recommended workflows. Point your agent at this URL before first use — it can read the guide and immediately start working with ClawStash.

Connected agents can call `refresh_tools` periodically to stay up-to-date with any tool changes.

## Tool Examples

### Create a Stash

```json
{
  "tool": "create_stash",
  "arguments": {
    "name": "Project Notes",
    "description": "Architecture decisions for the auth refactor",
    "tags": ["notes", "architecture"],
    "metadata": {"project": "auth-service"},
    "files": [
      {"filename": "decisions.md", "content": "# Auth Refactor\n\n..."},
      {"filename": "diagram.txt", "content": "User -> Gateway -> Auth..."}
    ]
  }
}
```

### Search and Read

```json
{
  "tool": "search_stashes",
  "arguments": {
    "query": "docker compose production",
    "tag": "config"
  }
}
```

```json
{
  "tool": "read_stash_file",
  "arguments": {
    "id": "stash-uuid",
    "filename": "docker-compose.yml"
  }
}
```

### Tag Graph

```json
{
  "tool": "get_tag_graph",
  "arguments": {
    "tag": "docker",
    "depth": 2,
    "min_weight": 2
  }
}
```
