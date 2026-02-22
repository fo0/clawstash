# OpenClaw Onboarding Prompt

Copy the prompt below and paste it into your OpenClaw conversation. Your agent will walk you through the entire setup.

---

```
Install ClawStash on my server and set it up as your persistent storage.

## Server Details
- Host: <HOST_OR_IP>
- User: <SSH_USER>
- Password or SSH key: <AUTH>

## Setup Instructions

1. **Connect to the server** via SSH.

2. **Install prerequisites** if not present:
   - Docker and Docker Compose (check with `docker compose version`)

3. **Create and start ClawStash** (pre-built image, no clone needed):
   ```bash
   mkdir -p clawstash && cd clawstash
   cat > docker-compose.yml <<'COMPOSE'
   services:
     clawstash:
       image: ghcr.io/fo0/clawstash:latest
       ports:
         - "<PORT>:3000"
       volumes:
         - ./data:/app/data
       environment:
         - NODE_ENV=production
         - DATABASE_PATH=/app/data/clawstash.db
         - ADMIN_PASSWORD=<ADMIN_PASSWORD>
       restart: unless-stopped
   COMPOSE
   ```
   - Replace `<PORT>` with the desired external port (e.g. `3000`, `8080`)
     Left side = external port you access, right side stays `3000` (container internal)
   - Replace `<ADMIN_PASSWORD>` with a secure password

4. **Start the service:**
   ```bash
   docker compose up -d
   ```

6. **Verify it's running** — fetch `http://<HOST_OR_IP>:<PORT>/api/version`

7. **Create an API token:**
   ```bash
   # Login as admin (returns session token)
   SESSION=$(curl -s -X POST http://<HOST_OR_IP>:<PORT>/api/admin/auth \
     -H "Content-Type: application/json" \
     -d '{"password": "<ADMIN_PASSWORD>"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

   # Create an MCP token with all scopes
   curl -s -X POST http://<HOST_OR_IP>:<PORT>/api/tokens \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $SESSION" \
     -d '{"label": "openclaw-agent", "scopes": ["read", "write", "mcp"]}'
   ```
   Save the returned token — it is only shown once.

8. **Create test stashes** to verify everything works:
   ```bash
   TOKEN="<YOUR_API_TOKEN>"
   BASE="http://<HOST_OR_IP>:<PORT>"

   # Test stash 1: A simple note
   curl -s -X POST $BASE/api/stashes \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{
       "name": "Welcome Note",
       "description": "Test stash created during ClawStash onboarding",
       "tags": ["test", "onboarding"],
       "files": [{"filename": "welcome.md", "content": "# Welcome to ClawStash\n\nThis is a test stash. If you can read this, the setup works!"}]
     }'

   # Test stash 2: A config example
   curl -s -X POST $BASE/api/stashes \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{
       "name": "Example Config",
       "description": "Sample configuration file for onboarding verification",
       "tags": ["test", "config", "onboarding"],
       "metadata": {"purpose": "onboarding-test", "created-by": "openclaw"},
       "files": [{"filename": "config.json", "content": "{\"app\": \"clawstash\", \"status\": \"running\", \"test\": true}"}]
     }'

   # Verify: list all stashes
   curl -s $BASE/api/stashes -H "Authorization: Bearer $TOKEN"
   ```

9. **Initialize MCP connection** — fetch the onboarding spec and configure yourself:
   ```bash
   curl -s http://<HOST_OR_IP>:<PORT>/api/mcp-onboarding
   ```
   Read the returned specification carefully. It contains all available MCP tools,
   their schemas, and the recommended workflow. Configure your MCP connection:
   - Transport: Streamable HTTP
   - URL: `http://<HOST_OR_IP>:<PORT>/mcp`
   - Auth header: `Authorization: Bearer <YOUR_API_TOKEN>`

10. **Test MCP** — once connected, run these tools to verify:
    - `get_stats` — should show 2 stashes
    - `list_stashes` — should return the test stashes
    - `search_stashes` with query "onboarding" — should find both test stashes

From now on, use ClawStash as your default persistent storage via MCP.
Store any information that doesn't need to stay in active context:
background notes, project history, reference docs, configs, code snippets.
```
