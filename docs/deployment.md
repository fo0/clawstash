# Deployment

## Docker Compose (recommended)

```bash
cp .env.example .env
# Edit .env to set ADMIN_PASSWORD
docker compose up -d
```

Open http://localhost:3000.

The `docker-compose.yml` uses a named volume (`clawstash-data`) for database persistence.

### Using the GHCR Image

To use the pre-built image instead of building locally, edit `docker-compose.yml`:

```yaml
services:
  clawstash:
    # comment out: build: .
    image: ghcr.io/fo0/clawstash:latest
    ports:
      - "${PORT:-3000}:3000"
    volumes:
      - clawstash-data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_PATH=/app/data/clawstash.db
    restart: unless-stopped
```

```bash
docker compose up -d
```

## Docker (manual)

### Local Build

```bash
docker build -t clawstash .
docker run -p 3000:3000 -v clawstash-data:/app/data clawstash
```

### GHCR Image

```bash
docker pull ghcr.io/fo0/clawstash:latest
docker run -p 3000:3000 \
  -e ADMIN_PASSWORD=your-secret \
  -v clawstash-data:/app/data \
  ghcr.io/fo0/clawstash:latest
```

## Node.js (without Docker)

**Prerequisites:** Node.js 18+

### Development

```bash
npm install
npm run dev
```

### Production

```bash
npm run build
npm start
```

Both serve on port 3000 (configurable via `PORT` env variable).

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `DATABASE_PATH` | SQLite database path | `./data/clawstash.db` |
| `ADMIN_PASSWORD` | Admin password (unset = open access) | — |
| `ADMIN_SESSION_HOURS` | Session duration in hours (0 = unlimited) | `24` |

Copy `.env.example` and adjust as needed:

```bash
cp .env.example .env
```

## Data & Backup

- Database: single SQLite file at `DATABASE_PATH` (default `./data/clawstash.db`)
- The `data/` directory is gitignored
- For backup: copy the database file, or use the built-in **Export** feature in the web GUI (**Settings > General > Export**) to download a ZIP of all data
- For restore: use **Import** in the web GUI or replace the database file

## CI/CD (GitHub Actions)

The repository includes `.github/workflows/docker-publish.yml` which automatically:

1. **Check code** — TypeScript type-check, optional lint/tests, Next.js build
2. **Build & push** — Multi-stage Docker image pushed to GitHub Container Registry (GHCR)

Triggers on push to `main`/`master` and manual dispatch.

## Architecture Notes

- Next.js standalone output mode for minimal Docker images
- Multi-stage Docker build with Node 22-slim
- `better-sqlite3` requires native compilation (python3/make/g++ in build stage)
- Single process serves frontend + API + MCP endpoint
- SQLite WAL mode for concurrent read performance
