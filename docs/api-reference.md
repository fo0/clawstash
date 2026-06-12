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

| Endpoint                               | Method | Description                                                           |
| -------------------------------------- | ------ | --------------------------------------------------------------------- |
| `/api/stashes`                         | GET    | List stashes (`?search=&tag=&archived=&page=&limit=`)                 |
| `/api/stashes`                         | POST   | Create a stash                                                        |
| `/api/stashes/:id`                     | GET    | Get a single stash with all files                                     |
| `/api/stashes/:id`                     | PATCH  | Update a stash                                                        |
| `/api/stashes/:id`                     | DELETE | Delete a stash                                                        |
| `/api/stashes/:id/files/:filename/raw` | GET    | Raw file content                                                      |
| `/api/stashes/:id/access-log`          | GET    | Access log (`?limit=`)                                                |
| `/api/stashes/stats`                   | GET    | Storage statistics                                                    |
| `/api/stashes/tags`                    | GET    | All tags with counts                                                  |
| `/api/stashes/metadata-keys`           | GET    | All unique metadata keys                                              |
| `/api/stashes/graph`                   | GET    | Tag relationship graph (`?tag=&depth=&min_weight=&min_count=&limit=`) |
| `/api/stashes/graph/stashes`           | GET    | Stash relationship graph                                              |

> **`?archived=` query param**: only the literal strings `true` and `false` are honored. Any other value (e.g. `?archived=1`, `?archived=yes`) is rejected with `400 Bad Request` and `{ "error": "Invalid 'archived' value. Use 'true' or 'false'." }`. Omit the parameter entirely to use the default (active stashes only).

> **Raw file route response header**: `/api/stashes/:id/files/:filename/raw` returns `Content-Disposition: inline; filename*=UTF-8''…` so non-ASCII filenames are preserved when downloaded.

### Versions

| Endpoint                                     | Method | Scope | Description                                                       |
| -------------------------------------------- | ------ | ----- | ----------------------------------------------------------------- |
| `/api/stashes/:id/versions`                  | GET    | read  | List versions (descending). Optional `?limit=&offset=` paginate   |
| `/api/stashes/:id/versions/diff`             | GET    | read  | Compare two versions (`?v1=&v2=`)                                 |
| `/api/stashes/:id/versions/:version`         | GET    | read  | Get a specific version snapshot                                   |
| `/api/stashes/:id/versions/:version/restore` | POST   | write | Restore an old version — creates a NEW version with prior content |

> **Restore semantics**: restore is non-destructive. It writes a new version
> at the head whose content matches the snapshot you passed in `:version`;
> the older versions are kept. Therefore `?v=2` on a stash currently at v5
> produces a new v6 whose content equals v2, and v5 is still listed in
> history.

> **Archive semantics**: PATCH `/api/stashes/:id` with body `{ "archived": true }` (or
> `false`) flips the archive flag inside a single transaction without creating a new version.
> Pass `archived` alongside content fields (name/description/tags/metadata/files) to change
> both in one transaction.

### Tokens

| Endpoint               | Method | Auth       | Description                                                         |
| ---------------------- | ------ | ---------- | ------------------------------------------------------------------- |
| `/api/tokens`          | GET    | admin      | List API tokens                                                     |
| `/api/tokens`          | POST   | admin      | Create API token                                                    |
| `/api/tokens/:id`      | DELETE | admin      | Delete API token                                                    |
| `/api/tokens/validate` | POST   | any Bearer | Validate a Bearer token (per-IP rate-limited: 10 attempts / 15 min) |

### Admin

| Endpoint             | Method | Description            |
| -------------------- | ------ | ---------------------- |
| `/api/admin/auth`    | POST   | Login with password    |
| `/api/admin/logout`  | POST   | Invalidate session     |
| `/api/admin/session` | GET    | Check session status   |
| `/api/admin/export`  | GET    | Export all data as ZIP |
| `/api/admin/import`  | POST   | Import data from ZIP   |

> **`/api/admin/import` semantics.** Wipes all stash data (`stashes`,
> `stash_files`, `stash_versions`, `stash_version_files`, `stash_relations`,
> `access_log`, `stashes_fts`). **Preserves** `admin_sessions` and
> `api_tokens` so the importing admin stays logged in and existing API
> integrations keep working against the freshly imported data. Foreign
> exports (a ZIP from a different server) therefore do NOT carry their
> tokens across — re-issue tokens / re-login on the target server if needed.

### GitHub Backup

Mirror stashes into a GitHub repository — full guide: [backup.md](backup.md).

| Endpoint                      | Method | Auth  | Description                                                            |
| ----------------------------- | ------ | ----- | ---------------------------------------------------------------------- |
| `/api/backup/settings`        | GET    | admin | Current configuration, connection, health (never includes the token)   |
| `/api/backup/settings`        | PUT    | admin | Replace configuration (repo, branch, prefix, interval, delete mode, …) |
| `/api/backup/token`           | POST   | admin | Connect with a PAT (`{"token": "…"}`); verified, then stored encrypted |
| `/api/backup/token`           | DELETE | admin | Disconnect (remove stored token)                                       |
| `/api/backup/device/start`    | POST   | admin | Start the OAuth device-flow login (`{"clientId": "…"}` optional)       |
| `/api/backup/device/poll`     | POST   | admin | Poll a pending login (`{"sessionId": "…"}`)                            |
| `/api/backup/github/repos`    | GET    | admin | Repositories visible to the connected account                          |
| `/api/backup/github/branches` | GET    | admin | Branches of a candidate repo (`?owner=&repo=`)                         |
| `/api/backup/sync`            | POST   | write | Back up now (`{"stashId": "…"?, "force": bool?}`; empty body = all)    |
| `/api/backup/status`          | GET    | read  | Configuration summary, health, per-stash sync states (`?stashId=`)     |
| `/api/backup/log`             | GET    | read  | Recent sync log (`?stashId=&limit=`, max 200)                          |

> Per-stash opt-out: `PATCH /api/stashes/:id` with `{"backup_enabled": false}` excludes a stash
> from the mirror (its mirrored copy is removed on the next sync, subject to the delete mode).

### System

| Endpoint              | Method | Description                                                                 |
| --------------------- | ------ | --------------------------------------------------------------------------- |
| `/api/health`         | GET    | Health check (no auth required) — returns status, timestamp, database stats |
| `/api/openapi`        | GET    | OpenAPI 3.0 schema (JSON)                                                   |
| `/api/mcp-spec`       | GET    | MCP specification (markdown)                                                |
| `/api/mcp-onboarding` | GET    | MCP onboarding guide for AI agents                                          |
| `/api/mcp-tools`      | GET    | MCP tool summaries (JSON)                                                   |
| `/api/version`        | GET    | Current version + latest available                                          |

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
# List versions (optionally paginate: ?limit=20&offset=0)
curl "http://localhost:3000/api/stashes/STASH_ID/versions?limit=20&offset=0" \
  -H "Authorization: Bearer cs_your_token"

# Diff two versions
curl "http://localhost:3000/api/stashes/STASH_ID/versions/diff?v1=1&v2=3" \
  -H "Authorization: Bearer cs_your_token"

# Restore a version (writes a NEW version with the old content; v5 remains)
curl -X POST http://localhost:3000/api/stashes/STASH_ID/versions/2/restore \
  -H "Authorization: Bearer cs_your_token"

# Archive a stash (does NOT create a new version)
curl -X PATCH http://localhost:3000/api/stashes/STASH_ID \
  -H "Authorization: Bearer cs_your_token" \
  -H "Content-Type: application/json" \
  -d '{"archived": true}'

# Unarchive
curl -X PATCH http://localhost:3000/api/stashes/STASH_ID \
  -H "Authorization: Bearer cs_your_token" \
  -H "Content-Type: application/json" \
  -d '{"archived": false}'

# Archive + edit name in one transaction (creates a new version because
# of the content change; archive flag flipped atomically)
curl -X PATCH http://localhost:3000/api/stashes/STASH_ID \
  -H "Authorization: Bearer cs_your_token" \
  -H "Content-Type: application/json" \
  -d '{"archived": true, "name": "Archived: My Stash"}'
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
    Authorization: 'Bearer cs_your_token',
  },
  body: JSON.stringify({
    name: 'My Stash',
    description: 'Created via JS',
    tags: ['example'],
    files: [{ filename: 'hello.js', content: 'console.log("hello")' }],
  }),
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
