# Development Notes

Setup hints, runtime quirks and operational details for ClawStash. CLAUDE.md keeps the five an agent needs most often; the full list lives here.

## Runtime & process model

- Next.js dev server runs on port 3000 with both frontend and API routes in one process.
- In production, `next start` serves the full application (no separate frontend/backend).
- Next.js standalone output mode is used for Docker (minimal `node server.js` deployment).
- MCP is available as Streamable HTTP at `/mcp` (Next.js route handler) and as stdio via `npm run mcp`.
- `src/instrumentation.ts` starts the GitHub backup scheduler at server boot (nodejs runtime only). The stdio MCP process runs **no** scheduler -- its writes are caught up by the web process's next sync.

## Database

- The SQLite database auto-creates in the `data/` directory on first run.
- The DB singleton uses `globalThis` to survive Next.js HMR reloads in development.
- `ClawStashDB` fail-fasts on unwritable DB paths (`db-access-check.ts`).

## Docker

- Multi-stage build with Node 26-slim; requires `python3` / `make` / `g++` for the `better-sqlite3` native addon compilation.
- Docker volume maps to `/app/data` for database persistence.
- `docker-entrypoint.sh` starts as root, chowns the data dir (fixes root-owned bind mounts), then drops to `node` (uid 1000) via `setpriv` -- there is deliberately **no** `USER` directive in the Dockerfile.

## CI/CD

- Pipeline: type-check -> (optional lint) -> (optional test) -> build -> Docker push to GHCR.
- Workflow: `.github/workflows/docker-publish.yml`, triggered by manual `workflow_dispatch`.
- Deployment detail: `docs/deployment.md`.

## Refactoring candidates

Refactoring does NOT happen automatically -- only on explicit user request, when repeated code smells emerge across multiple files in review, or when a feature implementation is significantly harder than expected due to code structure. Principles: `agent_docs/refactoring_guidelines.md`.

- **`src/server/db.ts` (~1150 lines)** -- Largest server file. Token/session, version history and FTS logic have already been split into `src/server/stores/` (`TokenStore`, `SessionStore`, `VersionStore`, `SearchStore`); `ClawStashDB` now delegates to them. Further extraction (e.g. tag-graph / relations) is optional and low priority.
- **`src/server/openapi.ts` (~830 lines)** -- Large schema definition (one big function). Could adopt `@asteasolutions/zod-to-openapi` to generate from the Zod schemas in `tool-defs.ts` (BACKLOG #105).
- **`src/components/StashViewer.tsx` (~1090 lines)** -- Largest frontend component. File display, TOC, access-log tab and metadata display could be extracted into sub-components (BACKLOG #106).
- **`src/components/Settings.tsx` (~680 lines)** -- Could extract the Welcome Dashboard and Storage Stats sections into dedicated sub-components within a `settings/` directory (BACKLOG #106).
- **`src/components/GraphViewer.tsx` / `StashGraphCanvas.tsx` (~1600 lines each)** -- Pure layout/draw/physics helpers mixed with the React components; extract-module candidates (BACKLOG #102 / #103).
- **`src/languages.ts` (~340 lines)** -- Extension map and content-based detection heuristics are large but stable. Low priority.
- **No linter** -- Adding ESLint would significantly improve code-quality assurance. Prettier is already configured for formatting (`.prettierrc.json`).
