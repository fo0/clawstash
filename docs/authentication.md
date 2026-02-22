# Authentication

ClawStash supports two authentication modes:

- **Open mode** (default) — no `ADMIN_PASSWORD` set, all features accessible without login
- **Protected mode** — `ADMIN_PASSWORD` set, login required for web GUI and tokens for API/MCP

## Quick Setup

Set `ADMIN_PASSWORD` in your environment or `.env` file:

```bash
ADMIN_PASSWORD=your-secret-password
ADMIN_SESSION_HOURS=24  # Session duration (0 = no expiration)
```

## Admin Login (Web GUI)

1. Open ClawStash in your browser
2. Enter the admin password on the login screen
3. A session token is created and stored in your browser (localStorage)
4. The session expires after `ADMIN_SESSION_HOURS` hours

## API Tokens

API tokens authenticate REST API and MCP requests. Create them in the web GUI.

### Create a Token

1. Log in as admin
2. Go to **Settings > API & Tokens**
3. Enter a label and select scopes
4. Click **Create Token**
5. **Copy the token immediately** — it is only shown once

### Token Scopes

| Scope | Access |
|-------|--------|
| `read` | Read stashes and data |
| `write` | Read + write (implies read) |
| `admin` | Full access including token management (implies all) |
| `mcp` | MCP server access |

### Use a Token

```bash
# REST API
curl -H "Authorization: Bearer cs_your_token" \
  http://localhost:3000/api/stashes

# Validate token
curl -X POST -H "Authorization: Bearer cs_your_token" \
  http://localhost:3000/api/tokens/validate
```

For MCP, include the token in the `Authorization` header of your MCP client config:

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

## Token Format

| Prefix | Type | Example |
|--------|------|---------|
| `cs_` | API token | `cs_a1b2c3d4e5f6...` |
| `csa_` | Admin session | `csa_f6e5d4c3b2a1...` |

Tokens are stored as SHA-256 hashes in the database — the plain token is only shown once at creation.

## Security Notes

- Tokens are hashed (SHA-256) before storage — they cannot be retrieved
- Admin sessions expire based on `ADMIN_SESSION_HOURS`
- Without `ADMIN_PASSWORD`, the instance is fully open — suitable for local development only
- Use HTTPS in production to protect tokens in transit
- The `admin` scope implies all other scopes
- The `write` scope implies `read`
