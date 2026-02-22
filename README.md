# ClawStash

**Persistent storage for AI agents.** Store text, code, configs, and files — retrieve them via MCP or REST API.

Built for agents like [OpenClaw](https://github.com/openclaw/openclaw) that need a reliable place to save and recall information across sessions.

## Why ClawStash?

AI agents lose context between sessions. ClawStash gives them a persistent memory:

- **Store anything** — code snippets, configs, notes, multi-file projects
- **Organize with tags & metadata** — structured key-value metadata and tags for easy retrieval
- **Full-text search** — find stashes by content, name, description, or tags
- **Token-efficient** — MCP tools return summaries first, full content only on demand
- **Version history** — every change is tracked, diffable, and restorable
- **Web GUI included** — dark-themed dashboard to browse, search, and manage stashes manually

## OpenClaw Setup (recommended)

Your agent handles everything — container install, token creation, test stashes, and MCP setup. Copy this into your OpenClaw agent:

```
Install ClawStash (ghcr.io/fo0/clawstash) on my server and set it up as your default persistent storage via MCP. Server: <HOST_OR_IP>, User: <SSH_USER>, Auth: <PASSWORD_OR_KEY>. Use port <PORT> (docker compose port mapping "<PORT>:3000"). Set ADMIN_PASSWORD to a secure value. After install: create an API token (scopes: read, write, mcp), create 2 test stashes to verify, then fetch /api/mcp-onboarding to read the full MCP spec and configure yourself. Details: https://raw.githubusercontent.com/fo0/clawstash/main/docs/openclaw-onboarding-prompt.md
```

Replace the `<...>` placeholders with your server details. Your agent will SSH in, deploy the container, and configure itself end-to-end.

> Step-by-step version of this prompt: [docs/openclaw-onboarding-prompt.md](docs/openclaw-onboarding-prompt.md)

## Manual Setup

<details>
<summary><strong>Docker — pre-built image</strong></summary>

No clone needed:

```bash
mkdir clawstash && cd clawstash && cat > docker-compose.yml <<'EOF'
services:
  clawstash:
    image: ghcr.io/fo0/clawstash:latest
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
      - DATABASE_PATH=/app/data/clawstash.db
      # - ADMIN_PASSWORD=your-secret-password
    restart: unless-stopped
EOF
docker compose up -d
```

Open http://localhost:3000 — done. Database is stored in `./data/`.

> Change the port mapping (e.g. `"8080:3000"`) to run on a different port. Uncomment `ADMIN_PASSWORD` to protect the instance.

</details>

<details>
<summary><strong>Docker — from source</strong></summary>

```bash
git clone https://github.com/fo0/clawstash.git
cd clawstash
docker compose up -d
```

Builds the image locally and starts on http://localhost:3000.

</details>

<details>
<summary><strong>Node.js (development)</strong></summary>

```bash
git clone https://github.com/fo0/clawstash.git
cd clawstash
npm install
npm run dev
```

Runs on http://localhost:3000.

</details>

## Connect Your AI Agent

### MCP (OpenClaw, Claude Code, etc.)

Add to your MCP client config:

```json
{
  "mcpServers": {
    "clawstash": {
      "type": "streamable-http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

For local stdio transport (no network):

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

> **No password set?** Auth is disabled in dev mode — no token needed.

### REST API

```bash
# Create a stash
curl -X POST http://localhost:3000/api/stashes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "My Config",
    "description": "Docker setup for production",
    "tags": ["docker", "config"],
    "files": [{"filename": "docker-compose.yml", "content": "version: \"3\"..."}]
  }'

# List stashes
curl http://localhost:3000/api/stashes \
  -H "Authorization: Bearer YOUR_TOKEN"

# Search
curl "http://localhost:3000/api/stashes?search=docker" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Full API docs: [docs/api-reference.md](docs/api-reference.md)

### Self-Onboarding for AI Agents

ClawStash provides a machine-readable onboarding endpoint. Point your agent at:

```
GET http://localhost:3000/api/mcp-onboarding
```

This returns a complete guide with all available tools, schemas, and recommended workflows — your agent can read it and start using ClawStash immediately.

## Use Cases

| Scenario | How |
|----------|-----|
| **Agent memory** | Store conversation context, learned preferences, project notes |
| **Code snippets** | Save and retrieve reusable code with syntax highlighting |
| **Config backup** | Version-controlled storage for dotfiles, Docker configs, env files |
| **Knowledge base** | Searchable collection of docs, guides, reference material |
| **Cross-session context** | Agent saves state in one session, picks it up in the next |
| **Multi-agent sharing** | Multiple agents read/write to the same stash collection |

## MCP Tools Overview

| Tool | What it does |
|------|-------------|
| `create_stash` | Store new content with files, tags, metadata |
| `read_stash` | Get stash metadata + file list (content on demand) |
| `read_stash_file` | Read a single file — most token-efficient |
| `list_stashes` | Browse all stashes with summaries |
| `search_stashes` | Full-text search with ranked results |
| `update_stash` | Update existing stash content |
| `delete_stash` | Remove a stash |
| `list_tags` | List all tags with usage counts |
| `get_tag_graph` | Explore tag relationships |
| `get_stats` | Storage statistics |
| `refresh_tools` | Get latest tool specs (for connected agents) |
| `check_version` | Check for updates |

Full MCP documentation: [docs/mcp.md](docs/mcp.md)

## Authentication

Set `ADMIN_PASSWORD` to protect your instance:

```bash
ADMIN_PASSWORD=your-secret-password
```

Then create API tokens in the web GUI under **Settings > API & Tokens**. Tokens have scopes: `read`, `write`, `admin`, `mcp`.

Without `ADMIN_PASSWORD`, everything is open (dev mode).

Full auth docs: [docs/authentication.md](docs/authentication.md)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `DATABASE_PATH` | SQLite database path | `./data/clawstash.db` |
| `ADMIN_PASSWORD` | Admin password (unset = open access) | — |
| `ADMIN_SESSION_HOURS` | Session duration in hours (0 = unlimited) | `24` |

## Deployment

Docker, Docker Compose, Node.js, and GHCR image options available.

See [docs/deployment.md](docs/deployment.md) for production setup, CI/CD, and Docker configuration.

## Key Features

- **Multi-file stashes** with name, description, tags, and key-value metadata
- **Full-text search** (FTS5) across all content with BM25 ranking
- **Tag graph** — visual force-directed graph showing tag relationships
- **Version history** with diff comparison and one-click restore
- **Access log** — track who accessed what and when (API, MCP, UI)
- **OpenAPI spec** at `/api/openapi` — import into Postman, Swagger UI, etc.
- **Responsive web GUI** — works on desktop and mobile
- **SQLite** — zero-config database, single file, easy backup

## Documentation

| Doc | Content |
|-----|---------|
| [API Reference](docs/api-reference.md) | All REST endpoints, examples, query parameters |
| [MCP Guide](docs/mcp.md) | MCP tools, token-efficient patterns, transport options |
| [Authentication](docs/authentication.md) | Admin login, API tokens, scopes, security |
| [Deployment](docs/deployment.md) | Docker, production, CI/CD, GHCR |
| [OpenClaw Onboarding](docs/openclaw-onboarding-prompt.md) | Copy-paste prompt for full agent-driven setup |
| [Contributing](CONTRIBUTING.md) | Development setup, code style, PRs |
| [Changelog](CHANGELOG.md) | Version history |
| [Security](SECURITY.md) | Vulnerability reporting |

## License

[MIT](LICENSE)
