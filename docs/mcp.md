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

> **Note:** Create an API token with the scopes `read`, `write` and `mcp` in the web GUI under **Settings > API & Tokens**. When `ADMIN_PASSWORD` is not set, no token is needed.

## Scopes

`mcp` is a **transport gate**: it decides whether a token may connect to `/mcp` at all — it
is not a capability. Each tool is authorized separately, with the same scope its REST
equivalent requires: `read` for the tools that read stash data, `write` for the tools that
create, change or delete it. The usual ladder applies (`admin` implies everything, `write`
implies `read`).

A call the token's scopes do not cover comes back as a normal MCP tool error
(`isError: true`) naming the missing scope — no exception, no partial write. A token holding
only `mcp` can connect and read the server's own specification, nothing more.

The **stdio** transport carries no token: the MCP client spawns the server locally with the
operator's own privileges, so it runs with full access, as before.

Details: [docs/authentication.md → Token Scopes](authentication.md#token-scopes).

## Available Tools

| Tool                | Scope   | Description                                                                                               |
| ------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| `create_stash`      | `write` | Create a new stash with files, tags, metadata. Returns confirmation only.                                 |
| `read_stash`        | `read`  | Get stash metadata + file list with sizes. Optional `include_content` for full content.                   |
| `read_stash_file`   | `read`  | Read a specific file's content from a stash (most token-efficient).                                       |
| `list_stashes`      | `read`  | List/search stashes with filters (tag, archived). Returns summaries with file sizes (no content).         |
| `update_stash`      | `write` | Update an existing stash. Returns confirmation only.                                                      |
| `delete_stash`      | `write` | Delete a stash.                                                                                           |
| `archive_stash`     | `write` | Archive or unarchive a stash (hide from default listings without deleting).                               |
| `search_stashes`    | `read`  | Full-text search with BM25 ranking, Porter stemming, and match snippets. Supports tag and archive filter. |
| `list_tags`         | `read`  | List all tags with usage counts.                                                                          |
| `get_tag_graph`     | `read`  | Tag relationship graph with optional focus tag, depth, and filters.                                       |
| `get_stats`         | `read`  | Storage statistics.                                                                                       |
| `get_rest_api_spec` | —       | Full OpenAPI 3.0 REST API specification (JSON).                                                           |
| `get_mcp_spec`      | —       | Full MCP specification (markdown with tool schemas).                                                      |
| `refresh_tools`     | —       | Get current tool specs — useful for long-running agents to stay up-to-date.                               |
| `check_version`     | `read`  | Check current version and whether an update is available; `upgrade` carries the steps + compare URL.      |
| `get_server_info`   | —       | Orient in one call: your scopes, callable tools, size limits, endpoints, next steps. Call it first.       |

Tools marked — need no scope beyond `mcp`: they describe the server itself and touch no
stash data, matching their unauthenticated REST twins (`/api/openapi`, `/api/mcp-spec`,
`/api/mcp-onboarding`, `/api/agent-skill`). `get_server_info` reports the running build
version only to tokens that hold `read` — the same rule `/api/version` applies.

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

Every piece of guidance an agent needs is served by the instance itself, from one source of
truth (`src/server/agent-guide.ts`), so the three ways in never disagree:

| Surface                                 | What it is                                                                                                                                                                                                  |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP `instructions`                      | Returned on `initialize`. Compact usage guide (start with `get_server_info`, workflow, conventions, error handling). Clients such as Claude Code and Cursor put it into the model's context automatically.  |
| `get_server_info` tool                  | The first call of a session: the token's scopes, which tools it can call and which need a higher scope, size limits, every endpoint of the instance, the build version (with `read`), suggested next steps. |
| `clawstash://guide/skill` resource      | SKILL.md in [Agent Skills](https://agentskills.io) format — same text as `GET /api/agent-skill`. Save it under `skills/clawstash/SKILL.md` if your agent loads skills from files.                           |
| `clawstash://guide/onboarding` resource | The skill plus the complete MCP specification (every tool's JSON Schema, data types) — same text as `GET /api/mcp-onboarding`.                                                                              |
| `GET /api/agent-skill`                  | SKILL.md over REST, unauthenticated. When to store, workflow with the REST twin of every tool, naming/tagging conventions, limits, errors, maintenance.                                                     |
| `GET /api/mcp-onboarding`               | Operational guide first, full specification second. Unauthenticated.                                                                                                                                        |
| `GET /llms.txt`                         | Discovery index ([llms.txt](https://llmstxt.org)): purpose, endpoints, links to the guides. Fetch it when you only know the host.                                                                           |

The web GUI (**Settings → API & Tokens → MCP API**) offers a ready-to-paste onboarding prompt
that names the instance, the token placeholder and these URLs; the banner shown once after
creating a token offers the same prompt with the token filled in.

### Keeping up to date

- `check_version` (REST: `GET /api/version`) compares the running build with `main`. When
  `update_available` is true, `upgrade` carries copy-pasteable steps (`docker compose pull &&
docker compose up -d`, or the plain-Node equivalent), a GitHub compare URL listing the commits
  in between, and the changelog link — an agent reports these to the user and never upgrades an
  instance on its own.
- `refresh_tools` returns the full current specification. Call it after a tool call failed with
  an unknown tool or argument, or right after an upgrade — not routinely, it is the whole spec.

## Tool Examples

### Create a Stash

```json
{
  "tool": "create_stash",
  "arguments": {
    "name": "Project Notes",
    "description": "Architecture decisions for the auth refactor",
    "tags": ["notes", "architecture"],
    "metadata": { "project": "auth-service" },
    "files": [
      { "filename": "decisions.md", "content": "# Auth Refactor\n\n..." },
      { "filename": "diagram.txt", "content": "User -> Gateway -> Auth..." }
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
