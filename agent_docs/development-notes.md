# Development Notes

Setup hints, runtime quirks and operational details for ClawStash. CLAUDE.md has no section for them -- it points here where a rule needs one.

## Runtime & process model

- **Node >= 22 in practice, although `engines` still declares `>=20.9.0`.** `better-sqlite3` 13 needs 22, and CI + the Docker image both run Node 26 -- so 20.x is a declared floor nothing is tested on. Treat 22 as the real minimum until `engines` is corrected.
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

- Pipeline (`check-code` job, Node 26): `npm ci` -> `format:check` -> `tsc --noEmit` -> lint (skipped only without a `lint` script) -> `test:run` -> build; then `build-and-push` pushes the image to GHCR.
- Workflow: `.github/workflows/docker-publish.yml`, triggered by manual `workflow_dispatch`.
- Deployment detail: `docs/deployment.md`.

### Which workflows actually run (canonical -- CLAUDE.md -> _Workflow Triggers_ -> `ci` points here)

- **`docker-publish.yml` is `workflow_dispatch`-only**, so a pushed branch legitimately has zero runs of it. `/ci` reporting "no runs" for it is configuration, not breakage.
- **`docs-format.yml`** is the one workflow that runs automatically: PRs and pushes to `main` touching `**.md`, Prettier-Markdown only (no `npm ci`, no build). Without it nothing would verify Markdown, even though `format:check` is `prettier --check .` and includes it. `.prettierignore` still applies, so the `.claude/` exclusion holds.
- **Two GitHub-managed workflows run without a file in the repo:** CodeQL (default setup -- `Analyze (actions)` / `Analyze (javascript-typescript)`, runs on every PR and gates merge) and Dependabot Updates.
- The local Automated Checks in CLAUDE.md -> _Commands_ remain the real gate for correctness.

### Toolchain quirk: `localStorage` in jsdom tests depends on the Node version

`docker-publish.yml` pins `node-version: '26'`, while `engines` says `>=20.9` and most machines run 22. That gap is not cosmetic for the test suite:

- Node 24+ defines `localStorage` / `sessionStorage` on `globalThis` itself. Without `--localstorage-file` the accessor yields `undefined` or throws.
- Vitest's jsdom environment only copies the window keys the Node global does not already carry, and its `window` **is** `globalThis` -- so jsdom's own Storage is unreachable and a bare `localStorage.setItem(...)` in a component test fails with `Cannot read properties of undefined`.
- On Node 22 there is no such global, jsdom's Storage lands, and the same test passes. **A storage-backed component test can therefore be green locally and red in CI.**

`vitest.setup.ts` (wired in through `setupFiles`) closes the gap: where the environment's Storage is unusable it installs an in-memory one, so component tests behave the same on every supported Node. Reproduce the CI-side failure locally with `NODE_OPTIONS='--experimental-webstorage' npx vitest run`.

## Refactoring candidates

When refactoring is allowed to happen at all, plus the principles: `agent_docs/refactoring_guidelines.md`. This section is only the candidate list -- it is not a work queue.

> Line counts below were last measured 2026-09-23 and are refreshed on each optimizer run. Regenerate with:
> `find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -rn | head -15`

- **`src/components/StashGraphCanvas.tsx` (~2053) / `src/components/GraphViewer.tsx` (~1994)** -- Pure layout/draw/physics helpers mixed with the React components; extract-module candidates (issues #486 / #485, ex-BACKLOG #103 / #102).
- **`src/components/StashViewer.tsx` (~1967 lines)** -- Largest frontend component outside the two graph canvases. File display, TOC, access-log tab and metadata display could be extracted into sub-components (BACKLOG #106).
- **`src/server/db.ts` (~1643 lines)** -- Largest server file. Token/session, version history and FTS logic have already been split into `src/server/stores/` (`TokenStore`, `SessionStore`, `VersionStore`, `SearchStore`, `BackupStore`); `ClawStashDB` now delegates to them. Further extraction (e.g. tag-graph / relations) is optional and low priority.
- **`src/server/openapi.ts` (~1207 lines)** -- Large schema definition (one big function). Could adopt `@asteasolutions/zod-to-openapi` to generate from the Zod schemas in `tool-defs.ts` (issue #466, ex-BACKLOG #105).
- **`src/App.tsx` (~1385 lines)** -- App shell: routing, global hotkeys, modal/dirty-state contracts (see MEMORY.md). Splitting it is risky -- the hotkey/overlay contract lives here; only with an explicit request.
- **`src/components/Settings.tsx` (~965 lines)** -- Could extract the Welcome Dashboard and Storage Stats sections into dedicated sub-components within the existing `settings/` directory (BACKLOG #106).
- **`src/components/Sidebar.tsx` (~981 lines)** / **`src/server/backup/backup-service.ts` (~614 lines)** -- Over the ~500-line mark but cohesive; low priority.
- **`src/components/editor/StashEditor.tsx` (~1222 lines)** / **`src/components/VersionHistory.tsx` (~667)** / **`src/components/SearchOverlay.tsx` (~518)** / **`src/api.ts` (~506)** -- Over the ~500-line mark; first listed 2026-09-23, not yet assessed for a split.
- **`src/languages.ts` (~373 lines)** -- Extension map and content-based detection heuristics are large but stable. Low priority.

## Linter scope

Cited from `CLAUDE.md` as `agent_docs/development-notes.md -> Linter scope`. It belongs with the CI/CD notes, not with the refactoring candidates above -- the list ends at `src/languages.ts`.

- **Linter scope** -- ESLint 9 (flat config, `eslint.config.js`) runs correctness rules only; Prettier keeps formatting (`.prettierrc.json`), and no ESLint rule may overlap it.
  - Base: `@eslint/js` recommended + `typescript-eslint` recommended everywhere, `recommendedTypeChecked` on `src/**` (project service), plus `react-hooks` `rules-of-hooks` + `exhaustive-deps`.
  - `no-floating-promises` is enforced on `src/server/**` and `src/app/api/**` only: on the server an unawaited promise is a lost write, inside components it is the normal fire-and-forget handler call.
  - `no-misused-promises` runs with `checksVoidReturn.attributes: false` so `onClick={async () => …}` stays idiomatic.
  - Off in tests: `unbound-method`, `no-base-to-string` (vitest mock/assert idioms).
  - Deliberately deferred, each with a reason in the config: the `no-unsafe-*` family + `no-explicit-any` + `restrict-template-expressions` (the `as`-cast style around better-sqlite3 rows would produce hundreds of hits), `require-await` (the MCP SDK types every tool handler as async), `no-unnecessary-type-assertion` (13 auto-fixable but purely cosmetic hits at the time of introduction). Revisit one family at a time.
  - `jsx-a11y` recommended on `**/*.{jsx,tsx}` (#538). It is a correctness set and carries no formatting rule, so it does not collide with Prettier.
    - Three rules sit at `warn` as a documented transition, never `off`: `click-events-have-key-events` (11), `no-static-element-interactions` (10), `no-noninteractive-element-interactions` (6). They are one cluster -- a click handler on a non-interactive element -- and each site needs a decision about what the element should _be_, not a mechanical edit. Part of the set is already tracked as #465. The counts only move down.
    - Everything else stays `error`. Deliberate patterns the plugin cannot recognise carry a per-site `eslint-disable-next-line` **with a reason** rather than a config-level exemption, so a genuinely new violation of those rules still fails the build: composite widgets labelled through `aria-labelledby` across a component boundary (`label-has-associated-control`), the APG roving-tabindex tablist whose container must not be a tab stop (`interactive-supports-focus`), focus placed by an explicit user action (`no-autofocus`), and focusable scroll regions / the ARIA window splitter (`no-noninteractive-tabindex`).
    - **What it does not cover:** the plugin has no `heading-order` rule at all, and no `scrollable-region-focusable` -- whether a container scrolls depends on CSS and content at runtime and is invisible to static analysis. It in fact flags the _fix_ for the latter (`tabIndex={0}` on a scroll container), which is why those sites carry directives. Both defect classes remain manual review items.
    - A multi-line `//` disable directive does not work: ESLint reads only the first comment line, so the directive lands on the next comment instead of the code. Keep the directive on one line (`-- reason` included) and put any longer explanation in a separate comment above it. Verify with `npx eslint . --report-unused-disable-directives`.

<!-- Generated by claude-code-optimizer v1.49.0 -->
