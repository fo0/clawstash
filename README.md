# ClawStash - AI Stash Storage

An AI-optimized stash storage system with REST API, MCP support, and web GUI. Built for AI agents.

## Features

- **Stash Home Gallery**: Card or list view of all stashes, switchable layout
- **Multi-File Stashes**: Create stashes with multiple files
- **Name & Description**: Separate title and AI-optimized description for each stash
- **Smart Tags**: Combobox with auto-complete for existing tags and free creation of new ones, displayed as tag pills
- **Key-Value Metadata**: UX-optimized editor with key suggestions and expand/collapse (first 3 visible)
- **Full-Text Search**: Search across names, descriptions, filenames, and file content
- **Tag Filter**: Filter stashes by tag directly from the sidebar with dropdown selection and search
- **Recent Tag Quick Filters**: Last 3 recently used tag filters shown as quick-access chips (persisted across sessions)
- **Deep Links**: URL routing (`/stash/:id`) — copy and share links directly
- **Auto-Filename**: First file automatically gets the stash name when creating new stashes
- **REST API**: Full CRUD operations for programmatic access
- **MCP Server**: Model Context Protocol support for direct AI agent integration
- **Access Log**: Track when and how each stash is accessed (API, MCP, UI)
- **Tooltips & UX**: Info icons, tooltips, and descriptions on all form fields and buttons
- **Syntax Highlighting**: PrismJS-powered syntax highlighting in editor and viewer with 30+ languages
- **Auto Language Detection**: Content-based language detection in viewer when filename doesn't provide a language
- **Rendered Preview**: Markdown and HTML files render as formatted output with a toggleable Raw/Preview switch (persisted in browser)
- **Copy & Share**: One-click copy for files and API endpoints
- **Dark Theme**: GitHub-inspired dark UI
- **Login Gate**: Password-based login blocks UI access, with remember-me via browser storage
- **API Auth**: All REST API and MCP endpoints require Bearer token authentication
- **Settings**: Centralized settings area with preferences, API management, storage stats, and about info
- **API Management**: Token management, OpenAPI schema, Swagger UI explorer, and usage examples
- **API Tokens**: Server-side token storage with scopes (Read, Write, Admin, MCP)
- **Persistent Preferences**: Layout mode saved across sessions

## Run Locally

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev
```

Opens at http://localhost:3000.

## Production

```bash
npm run build
npm start
```

Serves everything on port 3000.

## Docker Deployment

### With Docker Compose (recommended)

```bash
cp .env.example .env
docker compose up -d
```

Open http://localhost:3000

### Local Docker Build

```bash
docker build -t clawstash .
docker run -p 3000:3000 -v clawstash-data:/app/data clawstash
```

### Using the GHCR Image

After the first GitHub Actions build, the image is available:

```bash
docker pull ghcr.io/OWNER/clawstash:latest
docker run -p 3000:3000 -v clawstash-data:/app/data ghcr.io/OWNER/clawstash:latest
```

> **Note:** Replace `OWNER` with your GitHub username (lowercase).

## GitHub Actions

This repository includes a GitHub Actions workflow (`.github/workflows/docker-publish.yml`) that automatically:

1. **Code Quality Check** — Runs TypeScript type-check, linter, and tests; builds the application
2. **Docker Build & Push** — Builds a multi-stage Docker image and pushes it to GitHub Container Registry (GHCR)

## MCP Integration

ClawStash includes a remote MCP server via Streamable HTTP transport. Any MCP client can connect over the network. Authentication is required when `ADMIN_PASSWORD` is set - use an API token with the `mcp` scope:

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

For local use, the stdio transport is also available:

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

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `create_stash` | Create a new stash with files, tags, metadata. Returns confirmation (no echoed content). |
| `read_stash` | Get stash metadata and file list with sizes. Optional `include_content` for full file content. |
| `read_stash_file` | Read a specific file's content from a stash (most token-efficient). |
| `list_stashes` | List/search stashes with filters. Returns summaries with file sizes (no content). |
| `update_stash` | Update an existing stash. Returns confirmation (no echoed content). |
| `delete_stash` | Delete a stash |
| `search_stashes` | Full-text search across all stashes. Returns summaries with file sizes (no content). |
| `list_tags` | List all tags with usage counts |
| `get_stats` | Get storage statistics |
| `get_rest_api_spec` | Get the full OpenAPI 3.0 REST API specification (JSON) |
| `get_mcp_spec` | Get the full MCP specification (markdown with tool schemas and data types) |

### Token-Efficient Usage for AI Clients

The MCP tools are designed for token-efficient data access:

1. **Browse/search** with `list_stashes` or `search_stashes` (summaries only, includes file sizes)
2. **Inspect** a stash with `read_stash` (metadata + file list with sizes, no content by default)
3. **Read selectively** with `read_stash_file` (fetch only the files you need)
4. **Bulk read** with `read_stash(include_content=true)` only when total size is small
5. **Write operations** (`create_stash`, `update_stash`) return confirmations only, not echoed content

## REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stashes` | GET | List stashes as summary (`?search=&tag=&page=&limit=`) |
| `/api/stashes` | POST | Create a stash |
| `/api/stashes/stats` | GET | Storage statistics |
| `/api/stashes/tags` | GET | All tags with counts |
| `/api/stashes/metadata-keys` | GET | All unique metadata keys |
| `/api/stashes/:id` | GET | Get a stash |
| `/api/stashes/:id` | PATCH | Update a stash |
| `/api/stashes/:id` | DELETE | Delete a stash |
| `/api/stashes/:id/files/:filename/raw` | GET | Raw file content |
| `/api/stashes/:id/access-log` | GET | Access log for a stash (`?limit=`) |
| `/api/tokens` | GET | List API tokens (admin) |
| `/api/tokens` | POST | Create API token (admin) |
| `/api/tokens/:id` | DELETE | Delete API token (admin) |
| `/api/tokens/validate` | POST | Validate a Bearer token |
| `/api/admin/auth` | POST | Admin login (password) |
| `/api/admin/logout` | POST | Admin logout (invalidate session) |
| `/api/admin/session` | GET | Check admin session status |
| `/api/openapi` | GET | OpenAPI (Swagger) schema |
| `/api/mcp-spec` | GET | MCP specification (markdown with tool schemas and data types) |

### Example: Create a Stash

```bash
curl -X POST http://localhost:3000/api/stashes \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Docker Setup",
    "description": "Production Docker Compose configuration for the main stack",
    "tags": ["config", "docker"],
    "metadata": {"model": "claude-3", "purpose": "backup"},
    "files": [
      {"filename": "docker-compose.yml", "content": "version: \"3\"..."}
    ]
  }'
```

## Authentication

### Admin Login

ClawStash uses password-based admin authentication. Set `ADMIN_PASSWORD` to protect admin features:

```bash
ADMIN_PASSWORD=your-secret-password
ADMIN_SESSION_HOURS=24  # Session duration (0 = no expiration)
```

When `ADMIN_PASSWORD` is not set, all admin features are open (dev mode).

**Login flow:**
1. Go to **Settings > General** in the web UI
2. Enter the admin password and click "Login"
3. A session token is created and stored in localStorage
4. The session expires after `ADMIN_SESSION_HOURS` hours

### API Tokens

ClawStash supports server-side API tokens for authentication with configurable scopes.

#### Token Scopes (Hierarchy)

| Scope | Description |
|-------|-------------|
| `read` | Read stashes and data |
| `write` | Read + write (implies read) |
| `admin` | Full access including token management (implies all scopes) |
| `mcp` | MCP server access |

#### Create a Token

1. Log in as admin (see above)
2. Open the **API & Tokens** section in the sidebar
3. Enter a label and select scopes
4. Click "Create Token"
5. **Copy the token immediately** - it is only shown once

#### Use a Token

```bash
# REST API
curl -H "Authorization: Bearer cs_your_token" http://localhost:3000/api/stashes

# MCP access
# Add to MCP client config with Authorization header

# Token validation
curl -H "Authorization: Bearer cs_your_token" -X POST http://localhost:3000/api/tokens/validate
```

Tokens are stored as SHA-256 hashes in the SQLite database. Admin session tokens use the `csa_` prefix, API tokens use the `cs_` prefix.

### API Documentation UI

The web GUI includes an **API** section (sidebar button) with:
- **Quick Copy**: Copy full REST API spec (with OpenAPI JSON) or MCP API spec (with tool schemas and data types) for AI agent context
- **Token Management**: Create, view, and delete API tokens with scopes
- **Explorer**: Interactive Swagger UI for live API testing
- **OpenAPI JSON**: Full OpenAPI 3.0 schema for import into external tools
- **MCP Spec**: Comprehensive MCP specification with JSON Schema tool definitions and data types (shared from OpenAPI)
- **Examples**: Ready-to-use cURL, JavaScript, Python, and MCP tool call snippets

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `DATABASE_PATH` | SQLite database path | `./data/clawstash.db` |
| `ADMIN_PASSWORD` | Admin password for login | (none - open access) |
| `ADMIN_SESSION_HOURS` | Admin session duration in hours (0 = unlimited) | `24` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and contribution guidelines.

## License

This project is licensed under the [MIT License](LICENSE).
