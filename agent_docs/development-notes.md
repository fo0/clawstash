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

### Which workflows actually run (canonical -- CLAUDE.md -> CI points here)

- **`docker-publish.yml` is `workflow_dispatch`-only**, so a pushed branch legitimately has zero runs of it. `/ci` reporting "no runs" for it is configuration, not breakage.
- **`docs-format.yml`** is the one workflow that runs automatically: PRs and pushes to `main` touching `**.md`, Prettier-Markdown only (no `npm ci`, no build). Without it nothing would verify Markdown, even though `format:check` is `prettier --check .` and includes it. `.prettierignore` still applies, so the `.claude/` exclusion holds.
- **Two GitHub-managed workflows run without a file in the repo:** CodeQL (default setup -- `Analyze (actions)` / `Analyze (javascript-typescript)`, runs on every PR and gates merge) and Dependabot Updates.
- The local Automated Checks in CLAUDE.md -> _Commands_ remain the real gate for correctness.

## Refactoring candidates

When refactoring is allowed to happen at all, plus the principles: `agent_docs/refactoring_guidelines.md`. This section is only the candidate list -- it is not a work queue.

> Line counts below were last measured 2026-08-21 and are refreshed on each optimizer run. Regenerate with:
> `find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn | head -15`

- **`src/components/StashGraphCanvas.tsx` (~2014) / `src/components/GraphViewer.tsx` (~1933)** -- Pure layout/draw/physics helpers mixed with the React components; extract-module candidates (BACKLOG #102 / #103).
- **`src/components/StashViewer.tsx` (~1890 lines)** -- Largest frontend component. File display, TOC, access-log tab and metadata display could be extracted into sub-components (BACKLOG #106).
- **`src/server/db.ts` (~1638 lines)** -- Largest server file. Token/session, version history and FTS logic have already been split into `src/server/stores/` (`TokenStore`, `SessionStore`, `VersionStore`, `SearchStore`, `BackupStore`); `ClawStashDB` now delegates to them. Further extraction (e.g. tag-graph / relations) is optional and low priority.
- **`src/server/openapi.ts` (~1159 lines)** -- Large schema definition (one big function). Could adopt `@asteasolutions/zod-to-openapi` to generate from the Zod schemas in `tool-defs.ts` (BACKLOG #105).
- **`src/App.tsx` (~1247 lines)** -- App shell: routing, global hotkeys, modal/dirty-state contracts (see MEMORY.md). Splitting it is risky -- the hotkey/overlay contract lives here; only with an explicit request.
- **`src/components/Settings.tsx` (~890 lines)** -- Could extract the Welcome Dashboard and Storage Stats sections into dedicated sub-components within the existing `settings/` directory (BACKLOG #106).
- **`src/components/Sidebar.tsx` (~960 lines)** / **`src/server/backup/backup-service.ts` (~614 lines)** -- Over the ~500-line mark but cohesive; low priority.
- **`src/languages.ts` (~373 lines)** -- Extension map and content-based detection heuristics are large but stable. Low priority.

## Linter scope

Cited from `CLAUDE.md` as `agent_docs/development-notes.md -> Linter scope`. It belongs with the CI/CD notes, not with the refactoring candidates above -- the list ends at `src/languages.ts`.

- **Linter scope** -- ESLint 9 (flat config, `eslint.config.js`) runs correctness rules only; Prettier keeps formatting (`.prettierrc.json`), and no ESLint rule may overlap it.
  - Base: `@eslint/js` recommended + `typescript-eslint` recommended everywhere, `recommendedTypeChecked` on `src/**` (project service), plus `react-hooks` `rules-of-hooks` + `exhaustive-deps`.
  - `no-floating-promises` is enforced on `src/server/**` and `src/app/api/**` only: on the server an unawaited promise is a lost write, inside components it is the normal fire-and-forget handler call.
  - `no-misused-promises` runs with `checksVoidReturn.attributes: false` so `onClick={async () => …}` stays idiomatic.
  - Off in tests: `unbound-method`, `no-base-to-string` (vitest mock/assert idioms).
  - Deliberately deferred, each with a reason in the config: the `no-unsafe-*` family + `no-explicit-any` + `restrict-template-expressions` (the `as`-cast style around better-sqlite3 rows would produce hundreds of hits), `require-await` (the MCP SDK types every tool handler as async), `no-unnecessary-type-assertion` (13 auto-fixable but purely cosmetic hits at the time of introduction). Revisit one family at a time.
