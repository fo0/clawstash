# REST API Reference

ClawStash exposes a REST API for programmatic access. All endpoints are served from the same origin as the web GUI.

## Authentication

All endpoints require a Bearer token when `ADMIN_PASSWORD` is set:

```bash
curl -H "Authorization: Bearer cs_your_token" http://localhost:3000/api/stashes
```

See [authentication.md](authentication.md) for token creation and scopes.

## Endpoints

### Stashes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stashes` | GET | List stashes (`?search=&tag=&archived=&page=&limit=`) |
| `/api/stashes` | POST | Create a stash |
| `/api/stashes/:id` | GET | Get a single stash with all files |
| `/api/stashes/:id` | PATCH | Update a stash |
| `/api/stashes/:id` | DELETE | Delete a stash |
| `/api/stashes/:id/files/:filename/raw` | GET | Raw file content |
| `/api/stashes/:id/access-log` | GET | Access log (`?limit=`) |
| `/api/stashes/stats` | GET | Storage statistics |
| `/api/stashes/tags` | GET | All tags with counts |
| `/api/stashes/metadata-keys` | GET | All unique metadata keys |
| `/api/stashes/graph` | GET | Tag relationship graph (`?tag=&depth=&min_weight=&min_count=&limit=`) |
| `/api/stashes/graph/stashes` | GET | Stash relationship graph |

### Versions

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stashes/:id/versions` | GET | List all versions (descending) |
| `/api/stashes/:id/versions/diff` | GET | Compare two versions (`?v1=&v2=`) |
| `/api/stashes/:id/versions/:version` | GET | Get a specific version snapshot |
| `/api/stashes/:id/versions/:version/restore` | POST | Restore an old version |

### Tokens (admin-protected)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tokens` | GET | List API tokens |
| `/api/tokens` | POST | Create API token |
| `/api/tokens/:id` | DELETE | Delete API token |
| `/api/tokens/validate` | POST | Validate a Bearer token |

### Admin

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/auth` | POST | Login with password |
| `/api/admin/logout` | POST | Invalidate session |
| `/api/admin/session` | GET | Check session status |
| `/api/admin/export` | GET | Export all data as ZIP |
| `/api/admin/import` | POST | Import data from ZIP |

### System

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check (no auth required) — returns status, timestamp, database stats |
| `/api/openapi` | GET | OpenAPI 3.0 schema (JSON) |
| `/api/mcp-spec` | GET | MCP specification (markdown) |
| `/api/mcp-onboarding` | GET | MCP onboarding guide for AI agents |
| `/api/mcp-tools` | GET | MCP tool summaries (JSON) |
| `/api/version` | GET | Current version + latest available |

## Examples

### Create a Stash

```bash
curl -X POST http://localhost:3000/api/stashes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cs_your_token" \
  -d '{
    "name": "Docker Setup",
    "description": "Production Docker Compose configuration",
    "tags": ["config", "docker"],
    "metadata": {"environment": "production", "owner": "devops"},
    "files": [
      {"filename": "docker-compose.yml", "content": "version: \"3\"..."},
      {"filename": "Dockerfile", "content": "FROM node:22-slim..."}
    ]
  }'
```

### List Stashes with Search

```bash
# All stashes (paginated)
curl "http://localhost:3000/api/stashes?page=1&limit=20" \
  -H "Authorization: Bearer cs_your_token"

# Full-text search
curl "http://localhost:3000/api/stashes?search=docker+compose" \
  -H "Authorization: Bearer cs_your_token"

# Filter by tag
curl "http://localhost:3000/api/stashes?tag=config" \
  -H "Authorization: Bearer cs_your_token"
```

### Update a Stash

```bash
curl -X PATCH http://localhost:3000/api/stashes/STASH_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cs_your_token" \
  -d '{
    "name": "Updated Name",
    "tags": ["config", "docker", "v2"],
    "files": [
      {"filename": "docker-compose.yml", "content": "updated content..."}
    ]
  }'
```

### Archive / Unarchive a Stash

```bash
# Archive a stash (hide from default listings)
curl -X PATCH http://localhost:3000/api/stashes/STASH_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cs_your_token" \
  -d '{"archived": true}'

# Unarchive (restore to active)
curl -X PATCH http://localhost:3000/api/stashes/STASH_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer cs_your_token" \
  -d '{"archived": false}'

# List only archived stashes
curl "http://localhost:3000/api/stashes?archived=true" \
  -H "Authorization: Bearer cs_your_token"

# List only active (non-archived) stashes
curl "http://localhost:3000/api/stashes?archived=false" \
  -H "Authorization: Bearer cs_your_token"
```

### Get Raw File Content

```bash
curl http://localhost:3000/api/stashes/STASH_ID/files/docker-compose.yml/raw \
  -H "Authorization: Bearer cs_your_token"
```

### Version History

```bash
# List versions
curl http://localhost:3000/api/stashes/STASH_ID/versions \
  -H "Authorization: Bearer cs_your_token"

# Diff two versions
curl "http://localhost:3000/api/stashes/STASH_ID/versions/diff?v1=1&v2=3" \
  -H "Authorization: Bearer cs_your_token"

# Restore a version
curl -X POST http://localhost:3000/api/stashes/STASH_ID/versions/2/restore \
  -H "Authorization: Bearer cs_your_token"
```

## OpenAPI / Swagger

The full OpenAPI 3.0 schema is available at `/api/openapi`. Import it into tools like Postman or use the built-in Swagger UI explorer in the web GUI under **Settings > API > REST**.

## Language-Specific Examples

### JavaScript / TypeScript

```javascript
const response = await fetch('http://localhost:3000/api/stashes', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer cs_your_token'
  },
  body: JSON.stringify({
    name: 'My Stash',
    description: 'Created via JS',
    tags: ['example'],
    files: [{ filename: 'hello.js', content: 'console.log("hello")' }]
  })
});
const stash = await response.json();
```

### Python

```python
import requests

response = requests.post('http://localhost:3000/api/stashes',
    headers={'Authorization': 'Bearer cs_your_token'},
    json={
        'name': 'My Stash',
        'description': 'Created via Python',
        'tags': ['example'],
        'files': [{'filename': 'hello.py', 'content': 'print("hello")'}]
    })
stash = response.json()
```
