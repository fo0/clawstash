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

| Scope   | Access                                                                        |
| ------- | ----------------------------------------------------------------------------- |
| `read`  | Read stashes and data                                                         |
| `write` | Read + write (implies read)                                                   |
| `admin` | Full access including token management (implies all)                          |
| `mcp`   | **Transport gate only** — permits connecting to `/mcp`, grants no data access |

`read`, `write` and `admin` form a ladder (`admin` implies everything, `write` implies
`read`). `mcp` sits outside it: it decides whether a token may speak MCP at all, not what
it may do once connected.

### The `mcp` scope is not a capability

Every MCP tool requires the same scope its REST equivalent does — `read` for the tools
that read stash data, `write` for `create_stash`, `update_stash`, `archive_stash` and
`delete_stash`. A token holding only `mcp` can connect and ask the server to describe
itself (`get_mcp_spec`, `get_rest_api_spec`, `refresh_tools`), nothing else. A call its
scopes do not cover returns a normal MCP tool error (`isError: true`) naming the missing
scope.

A token for full agent use therefore carries **`read`, `write` and `mcp`** — the
combination `/api/mcp-onboarding` and [docs/openclaw-onboarding-prompt.md](openclaw-onboarding-prompt.md)
have always recommended.

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

| Prefix | Type          | Example               |
| ------ | ------------- | --------------------- |
| `cs_`  | API token     | `cs_a1b2c3d4e5f6...`  |
| `csa_` | Admin session | `csa_f6e5d4c3b2a1...` |

Tokens are stored as SHA-256 hashes in the database — the plain token is only shown once at creation.

## Security Notes

- Tokens are hashed (SHA-256) before storage — they cannot be retrieved
- Admin sessions expire based on `ADMIN_SESSION_HOURS`
- Without `ADMIN_PASSWORD`, the instance is fully open — suitable for local development only
- Use HTTPS in production to protect tokens in transit
- The `admin` scope implies all other scopes
- The `write` scope implies `read`
- The `mcp` scope is a transport gate, not a capability — MCP tools are authorized by
  `read` / `write` exactly like the REST routes
- `/api/health` and `/api/version` always answer `200` so uptime probes work without
  credentials, but once auth is enabled they withhold their detail fields from
  unauthorised callers: `health` omits the stash/file counts, `version` returns
  `current: null` / `latest: null` and skips the outbound GitHub update check
