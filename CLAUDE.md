# CLAUDE.md -- Project Guide

## Session Start -- Read Order

When a session begins, read in this order. Stop early if a file is missing.

1. `MEMORY.md` -- long-term project knowledge
2. `SCRATCHPAD.md` -- short-term working context
3. `BACKLOG.md` -- only if user references prior findings or asks "what's open"
4. `agent_docs/review_process.md`, `agent_docs/memory_process.md` -- only when needed
5. `agent_docs/mcp_catalog.md` -- only when MCPs come up
6. `.claude/skills/*/SKILL.md` -- only when its trigger fires

> Don't pre-load everything. The Tier-1 SessionStart hook already prints a reminder.

## Workflow Triggers

| User says...                                     | Skill to load                                             |
| ------------------------------------------------ | --------------------------------------------------------- |
| "done" / "fertig" / "finished" / "/done"         | `.claude/skills/done/SKILL.md`                            |
| "PR" / "create PR" / "/pr"                       | `.claude/skills/pr/SKILL.md`                              |
| "review" / "/review"                             | `.claude/skills/review/SKILL.md`                          |
| "security review" / "/security-review"           | `.claude/skills/security-review/SKILL.md`                 |
| "rollback" / "revert" / "undo" / "/rollback"     | `.claude/skills/rollback/SKILL.md`                        |
| "CI" / "fix CI" / "check the build" / "/ci"      | `.claude/skills/ci/SKILL.md`                              |
| "stuck" / "loop" / "going in circles" / "/stuck" | `.claude/skills/stuck/SKILL.md`                           |
| Diagram request                                  | `agent_docs/diagram_prompt.md` -> `docs/ARCHITECTURE.mmd` |

> After every implementation, the review process in `agent_docs/review_process.md` is available via the `review` skill -- done-skill does NOT auto-run reviews.
> Unresolved findings go to `BACKLOG.md` per `agent_docs/backlog_process.md`.
> Long-term knowledge -> `MEMORY.md`. Temporary working context -> `SCRATCHPAD.md`. Rules: `agent_docs/memory_process.md`.
> GitNexus is **read-only / analysis-only** -- the non-negotiable "GitNexus -- Read-Only Analysis Policy" sits **above** the `<!-- gitnexus:start -->` markers (so `gitnexus analyze` can't overwrite it); the navigation block (stats, tools, skills) lives between the markers.
> Reference GitHub issues in commit messages: `fix: resolve crash #42`.
> **On "done" / "fertig":** Commit uncommitted changes if any. Comment on related GitHub issue (English) with a summary and close it. **Do NOT push unless explicitly asked.**

## Output Languages

| Surface                                                                                  | Language                          |
| ---------------------------------------------------------------------------------------- | --------------------------------- |
| Chat / status messages to user                                                           | User's language (default: German) |
| Code, identifiers, comments                                                              | English                           |
| Commit messages                                                                          | English (Conventional Commits)    |
| PR titles + bodies                                                                       | English                           |
| GitHub issue comments                                                                    | English                           |
| Generated files (CLAUDE.md, agent_docs/\*, MEMORY.md, SCRATCHPAD.md, BACKLOG.md, skills) | English                           |
| Console / log output of the app                                                          | English                           |
| User-facing UI strings                                                                   | English                           |

## Performance / Modes

- **Default model:** the latest available Opus model (1M context) — Claude Code's default tier for coding work. Don't pin an older version unless the project explicitly requires it.
- **Fast mode** (`/fast` in Claude Code): the **same** Opus model with faster output — not a downgrade to a smaller model. Use when latency matters more than maximum reasoning depth.
- **Caveman mode** (chat compression): toggle per session -- `caveman lite|full|ultra` to switch, `stop caveman` / `normal mode` to disable. Affects chat only, never generated files.
- **Plan mode**: enter for non-trivial implementation strategy. Use the `Plan` subagent for delegation, or invoke `EnterPlanMode` directly. Skip for trivial single-step tasks.

## Project Overview

**ClawStash** is an AI-optimized stash storage system, built specifically for AI agents with REST API, MCP (Model Context Protocol) support, and a web GUI.

**Core features:**

- Text and file storage with multi-file support per stash
- Name + Description: Separate title and AI-optimized description per stash
- Archive: Hide stashes from default listings without deleting (toggle in UI, API, and MCP)
- REST API for programmatic access with Bearer token auth
- MCP Server for direct AI agent integration (Streamable HTTP + stdio)
- Web dashboard with dark-theme GUI (card/list view)
- Tags (Combobox), Metadata (Key-Value Editor), Full-text search
- Access log tracking via API, MCP, and UI
- Admin login gate with session management
- Settings area with API management, token CRUD, and storage statistics
- Version history with diff comparison and restore functionality
- GitHub backup: mirror stashes into a GitHub repo (device-flow login or PAT, scheduled/mutation/manual sync, per-stash opt-out) -- `docs/backup.md`
- Mobile-optimized responsive layout with collapsible sidebar

## Tech Stack

| Component                 | Technology                              | Version    |
| ------------------------- | --------------------------------------- | ---------- |
| Language                  | TypeScript (strict mode)                | 6          |
| Framework                 | Next.js (App Router)                    | 16         |
| Frontend                  | React                                   | 19         |
| Database                  | SQLite (better-sqlite3)                 | 12         |
| MCP Server                | @modelcontextprotocol/sdk               | 1.27       |
| Validation                | Zod                                     | 3.24       |
| Code Editor               | react-simple-code-editor, PrismJS       | 0.14, 1.30 |
| Markdown Rendering        | marked                                  | 18         |
| Diagram Rendering         | mermaid (lazy-loaded)                   | 11         |
| Diagram Viewer (zoom/pan) | react-zoom-pan-pinch                    | 4          |
| Text Diffing              | diff (jsdiff)                           | 9          |
| Module System             | ESM (`"type": "module"`)                | --         |
| Containerization          | Docker (multi-stage, standalone output) | --         |
| CI/CD                     | GitHub Actions -> GHCR                  | --         |
| Package Manager           | npm (`package-lock.json`)               | --         |
| Formatter                 | Prettier                                | 3.9        |
| Test Framework            | vitest                                  | 4.x        |

## Project Structure

See `agent_docs/project-structure.md` for the full directory tree (extracted to keep this file under the 40k-char budget).

## Commands

```bash
# Install
npm install                # Install dependencies

# Development
npm run dev                # Start Next.js dev server (frontend + API on port 3000)

# Automated Checks (run in this order -- format FIRST to avoid CI surprises)
npm run format             # Prettier write (auto-format; done-skill auto-invokes before commit)
npm run format:check       # Prettier formatting check (matches CI; read-only)
npx tsc --noEmit           # Type checking
npm test                   # Tests (vitest)
npm run build              # Production build (Next.js)

# Production
npm start                  # Start production server (Next.js)

# Other
npm run mcp                # Start MCP server (stdio transport)

# Architecture diagram
npx @mermaid-js/mermaid-cli mmdc -i docs/ARCHITECTURE.mmd -o docs/ARCHITECTURE.svg

# GitNexus (if enabled)
npx gitnexus status                    # Check index freshness
npx gitnexus analyze --skip-agents-md  # Rebuild index -- ALWAYS with --skip-agents-md (CLAUDE.md/AGENTS.md stay optimizer-managed)
```

> **Note:** No linter (ESLint) is configured yet. Formatting is enforced via Prettier (`npm run format:check`). When ESLint is added, extend automated checks:
>
> ```bash
> npm run lint             # Lint (when configured)
> ```

## Key Patterns

Full pattern descriptions live in `agent_docs/key-patterns.md`. CLAUDE.md keeps a short index only -- top entries below are pointers to follow up there.

- **Database Layer** (`src/server/db.ts`) -- `ClawStashDB` class, SQLite + WAL, FTS5 search, version history, access log.
- **DB Singleton** (`src/server/singleton.ts`) -- `globalThis`-backed `getDb()` survives Next.js HMR.
- **Middleware + Rate Limiter** (`src/middleware.ts`, `src/server/auth-rate-limit.ts`) -- permissive CORS for agents, security headers incl. HTTPS-gated HSTS, per-IP rate limiting on auth endpoints, `TRUST_PROXY` gate for forwarded headers.
- **Input Validation** (`src/server/validation.ts`) -- Zod schemas with size limits, path-traversal-safe filenames.
- **Authentication** (`src/server/auth.ts`) -- admin sessions (`csa_`) + API tokens (`cs_`), scope hierarchy admin > write > read.
- **API Route Handlers** (`src/app/api/`) -- Next.js Route Handlers with shared `checkScope` / `checkAdmin` helpers.
- **Spec Architecture (SoT)** -- `tool-defs.ts` + `shared-text.ts` feed OpenAPI, MCP spec, frontend API tabs.
- **State Management** (`src/App.tsx`) -- React-state-only app, URL routing via `pushState`, localStorage prefs.
- **Graph Viewer** (`src/components/GraphViewer.tsx`) -- canvas-based force-directed tag graph with cluster-aware layout.
- **Mermaid Rendering** (`src/utils/mermaid.ts`, `src/components/MermaidDiagram.tsx`) -- lazy-loaded, single render entry point, zoom/pan toolbar for standalone diagrams.
- **MCP Server** (`src/server/mcp-server.ts`, `src/server/mcp.ts`) -- factory function reads `tool-defs.ts`, Streamable HTTP at `/mcp` + stdio via `npm run mcp`.
- **GitHub Backup** (`src/server/backup/`, `stores/backup-store.ts`) -- Git Data API sync engine, device-flow/PAT auth, AES-256-GCM token at rest, scheduler via `src/instrumentation.ts`, DB mutation listener. Refs #108, ADR-0002.

### Error Handling

Try/catch in async route handlers; UI components keep error state in React. Validation errors go through `formatZodError()` for human-readable strings.

## Coding Conventions

- **Language**: All UI text and documentation in English
- **Module System**: ESM (`"type": "module"` in package.json)
- **Formatting**: 2-space indentation, single quotes in TS. `.claude/` is excluded via `.prettierignore` (tool-managed files; GitNexus rewrites its skill files non-Prettier-formatted) -- keep that exclusion.
- **Imports**: Named imports, `@/*` path aliases for server-side imports in route handlers
- **Components**: Functional React components with TypeScript interfaces for props
- **Component Organization**: Complex features split into sub-directories (`api/`, `editor/`) with focused, single-responsibility files. Shared components in `shared/`, utilities in `utils/`.
- **API Route Handlers**: Use `checkScope()`/`checkAdmin()` helper functions for auth instead of Express middleware
- **CSS**: Global CSS with CSS custom properties (no CSS-in-JS), BEM-like class naming. Responsive breakpoints: 640px (mobile), 768px (tablet), 1200px (medium), 1600px/2000px (large/extra-large).
- **Error Handling**: Try/catch in async handlers, error state in UI components
- **TypeScript**: Strict mode enabled, `noEmit`, target ES2022, Next.js plugin
- **Max file length**: ~300 lines (split), ~500 lines (strongly recommended) -- TS/JS extension defaults.

## Architecture Principles

- Single-process Next.js app (App Router) -- no separate backend/frontend processes.
- Single source of truth for MCP tool defs (`tool-defs.ts`) feeds server registration, MCP spec, and frontend tabs.
- Permissive CORS by design -- ClawStash must be reachable from any AI agent's origin.
- All persistence is local SQLite -- no external DB; deployment is single-binary + volume.
- Server validates everything via Zod at the trust boundary; clients are not trusted.

## Architecture Decisions

Significant decisions are recorded as ADRs under `docs/adr/`. Triggers + format: `agent_docs/adr_template.md`. Always grep `docs/adr/` before contradicting an existing decision. To reverse a past decision, add a new ADR with `Status: Supersedes ADR-NNNN` -- never edit accepted ADRs.

## Git Conventions

- **Branch Naming:** `claude/{description}-{shortId}` for agent branches, `feature/{name}` for manual
- **Commit Messages:** Conventional Commits: `type(scope): description #issue` (types: feat, fix, chore, refactor, docs)
- **Merge Strategy:** Squash merge for PRs
- **CI/CD:** GitHub Actions: type-check -> build -> Docker push to GHCR (`docker-publish.yml`)
- **Formatting guard (optional, recommended):** staged files can be auto-formatted on commit via husky + lint-staged -- setup + pitfalls in `agent_docs/ci_formatting_guard.md` (respects `.prettierignore`, so the `.claude/` + `data/` exclusions stay intact). Never bypass with `--no-verify`.

## Dependency Management

- **New dependencies:** Only after user approval with reasoning.
- **devDependencies:** Can be added without approval for tooling/testing.
- **Lock file:** `package-lock.json` -- always commit.

## Environment Variables

| Variable                   | Description                                                                                                                         | Default               | Required                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------------------------------------- |
| `PORT`                     | Server port                                                                                                                         | `3000`                | No                                      |
| `DATABASE_PATH`            | Path to SQLite database file                                                                                                        | `./data/clawstash.db` | No                                      |
| `NODE_ENV`                 | Environment mode                                                                                                                    | `development`         | No                                      |
| `ADMIN_PASSWORD`           | Admin password for login (unset = open access)                                                                                      | --                    | No                                      |
| `ADMIN_SESSION_HOURS`      | Admin session duration in hours (0 = unlimited)                                                                                     | `24`                  | No                                      |
| `TRUST_PROXY`              | Trust `X-Forwarded-*` headers (set to `1` or `true` when behind nginx, Traefik, Cloudflare, etc.)                                   | off                   | No (recommended behind a reverse proxy) |
| `CLAWSTASH_ENCRYPTION_KEY` | Key for secrets at rest (GitHub backup token), 64 hex chars. Unset = auto-generated key file next to the DB (`data/.clawstash-key`) | auto-generated        | No                                      |

Full list / details: `.env.example`.

### Secrets Locations

| Secret class       | Where it lives                                                                     | Never commit |
| ------------------ | ---------------------------------------------------------------------------------- | ------------ |
| Local dev secrets  | `.env` (gitignored), template in `.env.example`                                    | Yes          |
| CI/CD secrets      | GitHub Actions secrets (`gh secret set`)                                           | Yes          |
| Production secrets | Deployment platform's secret store (Docker host env / orchestrator secret manager) | Yes          |
| Test fixtures      | Synthetic values only -- never real credentials                                    | Yes          |

Rules:

- New secret needed -> add to `.env.example` with placeholder + comment, document in CLAUDE.md, request from user.
- Never `gh secret set` from agent code without explicit user command.
- Audit step in `security-review` skill scans for committed secrets (gitleaks / trufflehog).

## Deployment

- **Trigger:** push/tag on `main` -> GitHub Actions workflow `docker-publish.yml`
- **Pipeline:** type-check -> build -> Docker build (multi-stage, standalone output) -> push image to GHCR
- **Environments:** single image deployed to any container host; database persisted via volume mounted at `/app/data`
- **Agent scope:** Agent can push to feature branches, open/update PRs, suggest merge. **Agent does NOT trigger production deploys** without explicit user command.
- **Routine exception:** a session running an **owner-authorized routine** (the kickoff prompt declares itself an authorized Claude Code routine of the repo owner) **counts as an explicit user command**. Merges ordered by such a routine are pre-approved -- **including any deploy/publish pipeline the merge triggers** (CI/CD, Docker/GHCR publish, production deploy) -- provided the change set is non-destructive (additive; no data migration, no history rewrite, no repo-settings change) and the routine's verification passed. Destructive changes stay gated regardless of routine context.
- **Rollback:** see `.claude/skills/rollback/SKILL.md`. For deployed regressions, prefer revert-PR over redeploy of an old build.

## API / Interfaces

REST API with Bearer token auth + MCP Server for AI agent integration (Streamable HTTP + stdio).

- Full REST API reference: `docs/api-reference.md`
- MCP tools and patterns: `docs/mcp.md`
- OpenAPI spec served at `/api/openapi`
- MCP spec served at `/api/mcp-spec`

## Testing

- **Framework:** vitest 4.x (`npm test`, `npm run test:watch`)
- **Run:** `npm test`
- **Structure:** tests live next to source as `*.test.ts` / `*.spec.ts` or under `tests/`
- **Patterns:** unit tests with mocked DB / fetch; no real network or paid-API calls.

### Constraints (autonomy + zero-cost)

ClawStash is built and verified by AI agents. Tests must be:

- **Agent-runnable** with `npm test` -- no manual setup, no credentials, no interactive login.
- **Zero-cost** -- no real API calls, no real cloud resources, no production DB writes.
- **Deterministic** -- fake clocks, fake random, in-memory DBs, mocked transports.

External boundaries (HTTP, DB, queue, LLM, payment, mail) -> mock or use ephemeral in-memory fakes. Real-service smoke/E2E tests only on explicit user request -- they are NOT part of the default check pipeline.

## External Integrations / MCPs

Project-intended and common MCPs are documented in `agent_docs/mcp_catalog.md`. The optimizer never auto-detects host MCP availability -- fall back to standard tools (`Read`, `Bash`, `WebFetch`) when an MCP is not on the local host. Workflows must never hard-require an MCP.

Claude Code Remote trigger self-management (`send_later`, `create/update/delete/fire/list_triggers`, PR-activity subscribe/unsubscribe) is pre-approved in `.claude/settings.json` -> `permissions.allow` -- scheduled check-ins and Routine cleanup run without manual permission prompts in web/remote sessions. Scope-widening tools (`add_repo`, `register_repo_root`) still prompt by design.

## CI

CI failure handling is in `.claude/skills/ci/SKILL.md`. Triggered by `/ci`, "fix CI", "check the build". Auto-routes by run state (none / running / passed / failed / stale). Never auto-reruns; always verifies fixes locally before pushing.

## Subagents

For complex / parallel / read-heavy work, delegate to a Claude Code subagent rather than running everything in main context.

| `subagent_type`     | Use for                                              |
| ------------------- | ---------------------------------------------------- |
| `Explore`           | Read-only search, locate symbols / files             |
| `Plan`              | Design implementation strategy for non-trivial tasks |
| `general-purpose`   | Multi-step write+execute, write tests/docs, refactor |
| `claude-code-guide` | Questions about Claude Code itself (hooks, MCP, SDK) |

Rules:

- Direct tools beat subagents when the target is known (`Read` for known path, `grep` for known symbol).
- Parallelize independent subagent calls in a single message.
- Pass full context -- subagents have no conversation history.

Full guide: `agent_docs/review_process.md -> Subagent Delegation`.

## GitNexus -- Code Intelligence (Quick Reference)

GitNexus provides graph-based code intelligence via **read-only** MCP tools. The non-negotiable rules are in the "GitNexus -- Read-Only Analysis Policy" block below (above the `<!-- gitnexus:start -->` markers); CLI commands here.

```bash
# Read-only freshness checks
npx gitnexus status   # Check index freshness
npx gitnexus list     # List indexed repos
# Index rebuild is NOT routine. Only when `status` reports missing/stale AND a task needs it:
#   npx gitnexus analyze --skip-agents-md && git status   # then revert any tracked file it touched
```

- GitNexus is **analysis-only** -- it must never write tracked files (no `gitnexus_rename`, no `wiki`, no skill/doc regeneration).
- If any tool returns "Index is stale", rebuilding is not routine -> run `npx gitnexus analyze --skip-agents-md` only if the task needs it, then `git status` + `git checkout --` any tracked file it touched.
- **Always pass `--skip-agents-md` to `analyze`** -- CLAUDE.md/AGENTS.md are optimizer-managed; without the flag GitNexus rewrites their context sections. Only `analyze` writes those files; `status`/`index`/`clean`/`list` never do.
- Skill details: `.claude/skills/gitnexus/`
- Index directory `.gitnexus/` is gitignored.

## Development Notes

- Next.js dev server runs on port 3000 with both frontend and API routes in one process
- In production, `next start` serves the full application (no separate frontend/backend)
- Next.js standalone output mode used for Docker (minimal `node server.js` deployment)
- The SQLite database auto-creates in the `data/` directory on first run
- DB singleton uses `globalThis` to survive Next.js HMR reloads in development
- MCP is available as Streamable HTTP at `/mcp` (Next.js route handler) and as stdio via `npm run mcp`
- `src/instrumentation.ts` starts the GitHub backup scheduler at server boot (nodejs runtime only); the stdio MCP process runs no scheduler -- its writes are caught up by the web process's next sync
- Docker uses multi-stage build with Node 26-slim; requires python3/make/g++ for better-sqlite3 native addon compilation
- Docker volume maps to `/app/data` for database persistence
- Docker entrypoint (`docker-entrypoint.sh`) starts as root, chowns the data dir (fixes root-owned bind mounts), then drops to `node` (uid 1000) via `setpriv` — no `USER` directive in the Dockerfile; `ClawStashDB` additionally fail-fasts on unwritable DB paths (`db-access-check.ts`)
- CI/CD pipeline: type-check -> (optional lint) -> (optional test) -> build -> Docker push to GHCR

## Refactoring Notes

Refactoring does NOT happen automatically. Only upon explicit user request, when repeated code smells emerge across multiple files in review, or when a feature implementation is significantly harder than expected due to code structure. See `agent_docs/refactoring_guidelines.md` for principles.

- **`src/server/db.ts` (~1150 lines)**: Largest server file. Token/session, version history, and FTS logic have already been split into `src/server/stores/` (`TokenStore`, `SessionStore`, `VersionStore`, `SearchStore`); `ClawStashDB` now delegates to them. Further extraction (e.g. tag-graph / relations) is optional and low priority.
- **`src/server/openapi.ts` (~830 lines)**: Large schema definition (one big function). Could adopt `@asteasolutions/zod-to-openapi` to generate from Zod schemas in `tool-defs.ts` (BACKLOG #105).
- **`src/components/StashViewer.tsx` (~1090 lines)**: Largest frontend component. File display, TOC, access log tab, and metadata display sections could be extracted into sub-components (BACKLOG #106).
- **`src/components/Settings.tsx` (~680 lines)**: Could extract Welcome Dashboard and Storage Stats sections into dedicated sub-components within a `settings/` directory (BACKLOG #106).
- **`src/components/GraphViewer.tsx` / `StashGraphCanvas.tsx` (~1600 lines each)**: Pure layout/draw/physics helpers mixed with the React components — extract-module candidates (BACKLOG #102 / #103).
- **`src/languages.ts` (~340 lines)**: Extension map and content-based detection heuristics are large but stable. Low priority.
- **No linter**: Adding ESLint would significantly improve code quality assurance. (Prettier is already configured for formatting — see `.prettierrc.json`.)

## Documentation Rules

After every code change, check and update:

| File                         | Update when...                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `CLAUDE.md`                  | New components, config files, patterns, or technical details                          |
| `README.md`                  | New features, value proposition, onboarding changes for users                         |
| `BACKLOG.md`                 | Unresolved review findings (Accepted/Deferred) -- see `agent_docs/backlog_process.md` |
| `MEMORY.md`                  | Architecture decisions, gotchas, external deps, user preferences                      |
| `SCRATCHPAD.md`              | Current working context, open questions, short-lived notes                            |
| `docs/api-reference.md`      | New API endpoints, query parameters, examples                                         |
| `docs/backup.md`             | GitHub backup setup, sync semantics, security notes                                   |
| `docs/mcp.md`                | New MCP tools, transport options, usage patterns                                      |
| `docs/deployment.md`         | Docker, CI/CD, or production setup changes                                            |
| `docs/authentication.md`     | Auth flow, token, or scope changes                                                    |
| `docs/ARCHITECTURE.mmd`      | Structural changes (new modules, changed data flow, new external deps)                |
| `agent_docs/key-patterns.md` | Implementation pattern details that don't belong in CLAUDE.md                         |
| `.env.example`               | New configuration options added                                                       |

### Size monitoring

If `CLAUDE.md` exceeds ~40,000 characters: extract the largest section into `agent_docs/` and replace with a one-line reference. Do this proactively -- don't wait for warnings.

<!-- The GitNexus policy below is intentionally OUTSIDE the gitnexus:start/end markers so `gitnexus analyze` cannot overwrite it. Do not move it inside the markers. -->

## GitNexus -- Read-Only Analysis Policy (non-negotiable)

GitNexus is an **analysis/read-only** tool. It must never write to the repository.

- **Allowed:** read-only MCP tools only -- `gitnexus_query`, `gitnexus_impact`,
  `gitnexus_context`, `gitnexus_detect_changes`, and `status`/`list`. Use these to
  understand code, assess blast radius, and navigate. They never modify files.
- **Forbidden:** creating, scaffolding, regenerating, or editing ANY file as a side
  effect of GitNexus -- in particular `.claude/skills/**` (including GitNexus's own
  `gitnexus/*` skill files), `CLAUDE.md`, `AGENTS.md`, `docs/wiki/**`, or anything else.
- **`gitnexus analyze` / `index`:** only run when the index is genuinely missing or
  stale AND it is required for the current task. When you do, pass `--skip-agents-md`
  and treat it as index-only: it must NOT touch tracked files. If it modifies
  `.claude/skills/**`, `CLAUDE.md`, `AGENTS.md`, or any other tracked file, **revert
  those changes immediately** (`git checkout -- <paths>`). The index itself
  (`.gitnexus/`) stays gitignored and uncommitted.
- **Never** include GitNexus-generated skill/doc edits in a commit or PR. They are out
  of scope for every task unless I explicitly ask for them.
- **Pre-commit guard:** before any commit, run `git status` and verify no unexpected
  `.claude/**`, `CLAUDE.md`, `AGENTS.md`, or agent-doc changes are staged. If there
  are and they weren't the point of the task, revert them and proceed.

<!-- gitnexus:start -->

# GitNexus -- Code Intelligence

This project is indexed by GitNexus as **clawstash** (2191 symbols, 3899 relationships, 189 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> **Read-only.** Every tool below only _reads_ the index -- none modify files. The Read-Only Analysis Policy above governs this block.
> Rebuilding the index is **not routine**: only run `npx gitnexus analyze --skip-agents-md` when the task genuinely needs a fresh index, treat it as index-only, then `git status` and `git checkout --` any tracked file it touched. (`status`/`index`/`list` never write tracked files; `analyze` can, which is why the flag + revert are mandatory.)
> If `gitnexus_query` returns empty for a known symbol, the local index may not be in the global registry -- `npx gitnexus index .` registers it (writes only `~/.gitnexus`, no tracked files).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol -- callers, callees, which execution flows it participates in -- use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER use GitNexus to write or modify files -- no `gitnexus_rename`, no `wiki`, no skill/doc generation. GitNexus is read-only. To rename, use `gitnexus_impact` / `gitnexus_context` to enumerate every reference, then edit them yourself with normal tools.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.
- NEVER run `npx gitnexus analyze` without `--skip-agents-md`, and NEVER commit any file a GitNexus command touched -- `git checkout --` them. GitNexus must never rewrite `.claude/**`, `CLAUDE.md`, `AGENTS.md`, or `docs/wiki/**`.

## Resources

| Resource                                   | Use for                                  |
| ------------------------------------------ | ---------------------------------------- |
| `gitnexus://repo/clawstash/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/clawstash/clusters`       | All functional areas                     |
| `gitnexus://repo/clawstash/processes`      | All execution flows                      |
| `gitnexus://repo/clawstash/process/{name}` | Step-by-step execution trace             |

## Skill Files

| Task                                                                       | Read this skill file                                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?"                               | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"                                | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"                                           | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Plan a refactor -- read-only impact / reference mapping (you do the edits) | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference                                         | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index status / list / register (read-only CLI)                             | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->

<!-- Generated by claude-code-optimizer v1.15.0 -->
