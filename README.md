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

## Get Started

### 1. Let your agent do it (recommended)

Copy this into your OpenClaw agent — it installs ClawStash, creates test stashes, and sets up MCP automatically:

```
Install ClawStash (ghcr.io/fo0/clawstash) on my server and set it up as your default persistent storage via MCP. Server: <HOST_OR_IP>, User: <SSH_USER>, Auth: <PASSWORD_OR_KEY>. Use port <PORT> (docker compose port mapping "<PORT>:3000"). Set ADMIN_PASSWORD to a secure value. After install: create an API token (scopes: read, write, mcp), create 2 test stashes to verify, then fetch /api/mcp-onboarding to read the full MCP spec and configure yourself. Details: https://raw.githubusercontent.com/fo0/clawstash/main/docs/openclaw-onboarding-prompt.md
```

Replace the `<...>` placeholders with your server details — your agent handles the rest.

> Step-by-step version: [docs/openclaw-onboarding-prompt.md](docs/openclaw-onboarding-prompt.md)

### 2. Manual setup

Run this on your server — no clone needed:

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

Open http://localhost:3000 — done. Database persists in `./data/`.

> Change port mapping (e.g. `"8080:3000"`) for a different port. Uncomment `ADMIN_PASSWORD` to protect the instance.

After starting, point your AI agent at the onboarding endpoint to self-configure:

```
GET http://<HOST_OR_IP>:<PORT>/api/mcp-onboarding
```

This returns all available MCP tools, schemas, and recommended workflows — your agent reads it and starts using ClawStash immediately.

## MCP Connection

Add to your MCP client config (OpenClaw, Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "clawstash": {
      "type": "streamable-http",
      "url": "http://<HOST_OR_IP>:<PORT>/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

Create API tokens in the web GUI under **Settings > API & Tokens** (scopes: `read`, `write`, `mcp`).

## MCP Tools

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

## Documentation

| Doc | Content |
|-----|---------|
| [OpenClaw Onboarding](docs/openclaw-onboarding-prompt.md) | Copy-paste prompt for full agent-driven setup |
| [API Reference](docs/api-reference.md) | REST endpoints, examples, query parameters |
| [MCP Guide](docs/mcp.md) | MCP tools, token-efficient patterns, transport options |
| [Authentication](docs/authentication.md) | Admin login, API tokens, scopes |
| [Deployment](docs/deployment.md) | Docker, CI/CD, GHCR, production setup |

## License

[MIT](LICENSE)
