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

| User says...                                     | Skill to load                             |
| ------------------------------------------------ | ----------------------------------------- |
| "done" / "fertig" / "finished" / "/done"         | `.claude/skills/done/SKILL.md`            |
| "PR" / "create PR" / "/pr"                       | `.claude/skills/pr/SKILL.md`              |
| "review" / "/review"                             | `.claude/skills/review/SKILL.md`          |
| "security review" / "/security-review"           | `.claude/skills/security-review/SKILL.md` |
| "rollback" / "revert" / "undo" / "/rollback"     | `.claude/skills/rollback/SKILL.md`        |
| "CI" / "fix CI" / "check the build" / "/ci"      | `.claude/skills/ci/SKILL.md`              |
| "stuck" / "loop" / "going in circles" / "/stuck" | `.claude/skills/stuck/SKILL.md`           |
| "check dependencies" / "update deps" / "/beacon" | `.claude/skills/beacon/SKILL.md`          |
| Verify a UI change in a real browser             | `.claude/skills/verify/SKILL.md`          |
| Diagram request                                  | `agent_docs/diagram_prompt.md`            |

> Review runs via the `review` skill -- done-skill does NOT auto-run it. Findings -> `BACKLOG.md` (`agent_docs/backlog_process.md`). Knowledge -> `MEMORY.md` / `SCRATCHPAD.md` (`agent_docs/memory_process.md`).
> **On "done" / "fertig":** commit uncommitted changes, comment on + close the related issue (English), reference it in the commit (`fix: resolve crash #42`). **Do NOT push unless explicitly asked.**

## Output Languages

| Surface                                       | Language                          |
| --------------------------------------------- | --------------------------------- |
| Chat / status messages to user                | User's language (default: German) |
| Code, identifiers, comments                   | English                           |
| Commit messages                               | English (Conventional Commits)    |
| PR titles + bodies                            | English                           |
| GitHub issue comments                         | English                           |
| Generated files (CLAUDE.md, agent_docs, etc.) | English                           |
| Console / log output of the app               | English                           |
| User-facing UI strings                        | English                           |

## Performance / Modes

- **Default model:** whatever the session resolves to -- don't pin one here or in `.claude/settings.json`; `/model` switches mid-session.
- **Fast mode** (`/fast`): same Opus model, faster output -- not a downgrade. Use when latency beats reasoning depth.
- **Caveman mode** (chat compression): `caveman lite|full|ultra` / `stop caveman`. Chat only, never generated files.
- **Plan mode**: for non-trivial implementation strategy -- `Plan` subagent or `EnterPlanMode`. Not for single-step tasks.

## Project Overview

**ClawStash** is an AI-optimized stash storage system built for AI agents: text and multi-file stashes with tags, metadata, full-text search and version history, exposed through a REST API (Bearer token auth), an MCP server (Streamable HTTP + stdio) and a dark-theme web GUI. Persistence is local SQLite; an optional GitHub backup mirrors stashes into a repo.

User-facing feature list: `README.md`. Backup semantics: `docs/backup.md`.

## Tech Stack

| Component       | Technology                            | Version         |
| --------------- | ------------------------------------- | --------------- |
| Language        | TypeScript (strict)                   | 6               |
| Runtime         | Node.js (CI + Docker run 26)          | >= 20.9         |
| Framework       | Next.js (App Router) + React          | 16 / 19         |
| Database        | SQLite (better-sqlite3)               | 12              |
| MCP Server      | @modelcontextprotocol/sdk             | 1.27            |
| Validation      | Zod                                   | 3.24            |
| Rendering       | marked, mermaid (lazy), diff, PrismJS | 18, 11, 9, 1.30 |
| Module System   | ESM (`"type": "module"`)              | --              |
| Container / CI  | Docker (standalone) -> GHCR Actions   | --              |
| Package Manager | npm (`package-lock.json`)             | --              |
| Formatter       | Prettier                              | 3.9             |
| Test Framework  | vitest                                | 4.x             |

Exact versions: `package.json`.

## Project Structure

```
src/
  app/          # App Router: pages, /api handlers, /mcp endpoint
  components/   # React UI (+ editor/ settings/ api/ shared/)
  server/       # DB, auth, validation, MCP, OpenAPI (+ stores/ backup/)
  hooks/ utils/ styles/
docs/ (user docs + ARCHITECTURE.mmd + adr/), agent_docs/, .claude/skills/, scripts/, public/
```

Full directory tree: `agent_docs/project-structure.md`.

## Commands

```bash
# Install
npm install

# Development
npm run dev                # Next.js dev server (frontend + API, port 3000)

# Automated Checks (run in this order -- format FIRST to avoid CI surprises)
npm run format             # Prettier write (done-skill auto-invokes before commit)
npm run format:check       # Prettier check (matches CI; read-only)
npx tsc --noEmit           # Type checking
npm test                   # Tests (vitest)
npm run build              # Production build

# Single-file test (targeted check after changes)
npx vitest run path/to/file.test.ts

# Production / MCP
npm start                  # Production server
npm run mcp                # MCP server (stdio transport)

# Architecture diagram
npx @mermaid-js/mermaid-cli mmdc -i docs/ARCHITECTURE.mmd -o docs/ARCHITECTURE.svg
```

> **No linter (ESLint) configured yet.** Formatting is enforced by Prettier. When ESLint lands, add `npm run lint` above.
> GitNexus CLI (read-only): `agent_docs/gitnexus.md`.

## Key Patterns

Top 5 below. All patterns in full: `agent_docs/key-patterns.md`.

- **Database Layer** (`src/server/db.ts`) -- `ClawStashDB`, SQLite + WAL, FTS5 search, version history, access log; delegates to `src/server/stores/`.
- **DB Singleton** (`src/server/singleton.ts`) -- `globalThis`-backed `getDb()` survives Next.js HMR.
- **Spec Architecture (SoT)** -- `tool-defs.ts` + `shared-text.ts` feed OpenAPI, MCP spec and frontend API tabs.
- **Authentication** (`src/server/auth.ts`) -- admin sessions (`csa_`) + API tokens (`cs_`), scopes admin > write > read.
- **Middleware + Rate Limiter** (`src/middleware.ts`, `auth-rate-limit.ts`) -- permissive CORS, security headers, per-IP auth rate limiting, `TRUST_PROXY` gate.

### Error Handling

Try/catch in async route handlers; UI components keep error state in React. Validation errors go through `formatZodError()`.

## Coding Conventions

- All UI text and documentation in **English**; ESM everywhere (`"type": "module"`).
- 2-space indent, single quotes in TS. `.claude/` stays excluded in `.prettierignore` -- keep that exclusion.
- Named imports; `@/*` path aliases for server-side imports in route handlers.
- Functional React components with typed props; complex features split into sub-directories.
- API route handlers use `checkScope()` / `checkAdmin()` helpers -- no Express-style middleware.
- Global CSS with custom properties (no CSS-in-JS), BEM-like naming.
- TypeScript strict, `noEmit`, target ES2022.
- Max file length: ~300 lines (split), ~500 lines (strongly recommended).

Full conventions: `agent_docs/coding-conventions.md`.

## Architecture Principles

- Single-process Next.js app (App Router) -- no separate backend/frontend processes.
- `tool-defs.ts` is the single source of truth feeding server registration, MCP spec and frontend tabs.
- Permissive CORS by design -- ClawStash must be reachable from any AI agent's origin.
- All persistence is local SQLite -- no external DB; deployment is single-binary + volume.
- Server validates everything via Zod at the trust boundary; clients are not trusted.

## Architecture Decisions

Significant decisions are recorded as ADRs under `docs/adr/`. Triggers + format: `agent_docs/adr_template.md`. Always grep `docs/adr/` before contradicting an existing decision. To reverse one, add a new ADR with `Status: Supersedes ADR-NNNN` -- never edit accepted ADRs.

## Git Conventions

- **Branch Naming:** `claude/<description>-<shortId>` for agent branches, `feature/<name>` for manual
- **Commit Messages:** Conventional Commits `type(scope): description #issue` (feat, fix, chore, refactor, docs)
- **Merge Strategy:** Squash merge for PRs
- **CI/CD:** `docker-publish.yml` (manual dispatch, Node 26): format:check -> `tsc --noEmit` -> lint/test when those scripts exist -> build, then Docker build + push to GHCR
- **Formatting guard (optional):** husky + lint-staged auto-format on commit -- `agent_docs/ci_formatting_guard.md`. Never bypass with `--no-verify`.

## Dependency Management

- **New dependencies:** Only after user approval with reasoning.
- **devDependencies:** Can be added without approval for tooling/testing.
- **Lock file:** `package-lock.json` -- always commit.

## Environment Variables

| Variable                   | Description                       | Default               |
| -------------------------- | --------------------------------- | --------------------- |
| `DATABASE_PATH`            | SQLite database file              | `./data/clawstash.db` |
| `ADMIN_PASSWORD`           | Admin login (unset = open access) | --                    |
| `TRUST_PROXY`              | Trust `X-Forwarded-*`             | off                   |
| `CLAWSTASH_ENCRYPTION_KEY` | Secrets at rest, 64 hex chars     | auto-generated        |
| `PORT`                     | Server port                       | `3000`                |

Full list + secret locations: `agent_docs/env-vars.md`, `.env.example`. Never `gh secret set` from agent code without an explicit user command; `security-review` scans for committed secrets.

## Deployment

- **Trigger:** manual `workflow_dispatch` on `docker-publish.yml`; pipeline type-check -> build -> multi-stage Docker build -> push to GHCR. Single image, any container host; DB volume at `/app/data`.
- **Agent scope:** push to feature branches, open/update PRs, suggest merge. **Agent does NOT trigger production deploys** without explicit user command.
- **Routine exception:** a session running an **owner-authorized routine** counts as an explicit user command -- its merges are pre-approved _including_ any pipeline they trigger (CI/CD, GHCR publish, prod deploy), provided the change set is non-destructive (additive; no data migration, no history rewrite, no repo-settings change) and verification passed. Destructive changes stay gated. Full gate: `.claude/skills/pr/SKILL.md -> /pr merge`.
- **Rollback:** `.claude/skills/rollback/SKILL.md`. Prefer revert-PR over redeploying an old build.

Deployment detail: `docs/deployment.md`.

## API / Interfaces

REST API with Bearer token auth + MCP server (Streamable HTTP + stdio). OpenAPI at `/api/openapi`, MCP spec at `/api/mcp-spec`.

Full reference: `docs/api-reference.md` - MCP tools: `docs/mcp.md` - auth/scopes: `docs/authentication.md`.

## Testing

- **Framework:** vitest 4.x - **Run:** `npm test` (`npm run test:watch` for watch mode)
- **Structure:** colocated `__tests__/` folders under `src/`; vitest collects `src/**/*.{test,spec}.{ts,tsx}` (`vitest.config.ts`: node env, `@/*` alias, typecheck off)
- **Patterns:** unit tests with mocked DB / fetch; no real network or paid-API calls
- **Constraints:** agent-runnable, zero-cost, deterministic -- no real API calls, cloud resources or prod DB writes; mock external boundaries. Real-service E2E only on explicit request. Details: `agent_docs/review_process.md -> Test execution constraints`.

## External Integrations / MCPs

Project-intended and common MCPs: `agent_docs/mcp_catalog.md`. Never auto-detect host MCP availability -- fall back to standard tools (`Read`, `Bash`, `WebFetch`) when an MCP is absent. Workflows must never hard-require an MCP.

**Trigger tools never prompt.** `.claude/settings.json` -> `permissions.allow` holds exactly one `mcp__<server>__*` glob per Claude Code Remote spelling, plus the two `mcp__github__(un)subscribe_pr_activity` entries (there is no `mcp__github__*` glob). A per-tool entry that a glob in the same list already matches is redundant -- those were pruned; do not re-add them. **Self-heal:** a tool that still prompts means its server spelling is missing -- append `mcp__<that server>__*` and commit it on the current branch/PR. **Never write `deny`/`ask`.** Rationale, trust-gate caveat and the user-level fallback: `agent_docs/mcp_catalog.md`.

## CI

CI failure handling: `.claude/skills/ci/SKILL.md`. Triggered by `/ci`, "fix CI", "check the build". Auto-routes by run state (none / running / passed / failed / stale). Never auto-reruns; always verifies fixes locally before pushing.

`docker-publish.yml` is the only workflow and it is `workflow_dispatch`-only -- nothing runs on push or PR, so a pushed branch legitimately has **zero** runs and `/ci` reporting "no runs" is configuration, not breakage. The local Automated Checks above are the real gate.

## Subagents

Delegate complex / parallel / read-heavy work: `Explore` (read-only search), `Plan` (implementation strategy), `general-purpose` (write+execute, tests, docs, refactor), `claude-code-guide` (Claude Code itself -- hooks, MCP, SDK).

Direct tools beat subagents when the target is known. Parallelize independent calls in one message. Pass full context -- subagents have no conversation history. Full guide: `agent_docs/review_process.md -> Subagent Delegation`.

## Development Notes

- Dev server runs frontend + API in one process on port 3000; production uses `next start` with standalone output.
- SQLite auto-creates in `data/` on first run; the DB singleton uses `globalThis` to survive HMR.
- `src/instrumentation.ts` starts the GitHub backup scheduler at boot (nodejs runtime only); the stdio MCP process runs no scheduler.
- Docker: multi-stage Node 26-slim (needs python3/make/g++ for `better-sqlite3`), volume at `/app/data`, entrypoint drops root -> `node` via `setpriv`.

Full notes: `agent_docs/development-notes.md`.

## Refactoring Notes

Refactoring does NOT happen automatically -- only on explicit request, on repeated review smells, or when structure blocks a feature. Principles: `agent_docs/refactoring_guidelines.md`.

Candidate list with line counts and BACKLOG refs: `agent_docs/development-notes.md -> Refactoring candidates`.

## Documentation Rules

After every code change, check and update:

| File                           | Update when...                                      |
| ------------------------------ | --------------------------------------------------- |
| `CLAUDE.md`                    | New components, configs, patterns, technical detail |
| `README.md`                    | New features, onboarding changes                    |
| `BACKLOG.md`                   | Unresolved review findings                          |
| `MEMORY.md`                    | Decisions, gotchas, deps, user preferences          |
| `SCRATCHPAD.md`                | Working context, open questions                     |
| `docs/*.md`                    | API, backup, MCP, deployment, auth changes          |
| `docs/ARCHITECTURE.mmd`        | Modules, data flow or external deps changed         |
| `agent_docs/key-patterns.md`   | Pattern detail not belonging in CLAUDE.md           |
| `.env.example` + `env-vars.md` | New configuration options                           |

### Context budget

`CLAUDE.md`, `MEMORY.md` and `SCRATCHPAD.md` load every session, so they are budgeted: **15k / 8k / 4k** target, offload at **20k / 16k / 8k**. `agent_docs/`, `.claude/skills/` and `docs/` are read on demand and unbudgeted.

Over budget -> **move** content out and leave a one-line pointer (never delete to fit, never summarize detail away). Ladder + archive format: `agent_docs/context_budget.md`. The Tier-1 budget guard flags it after any Edit/Write; act in the same session.

<!-- The GitNexus policy below is intentionally OUTSIDE the gitnexus:start/end markers so `gitnexus analyze` cannot overwrite it. Do not move it inside the markers. -->

## GitNexus -- Read-Only Analysis Policy (non-negotiable)

GitNexus is **analysis/read-only** and must never write to the repository: read-only tools only (`gitnexus_query`, `gitnexus_impact`, `gitnexus_context`, `gitnexus_detect_changes`, `status`/`list`) -- never `gitnexus_rename`, `wiki`, or skill/doc generation. Run `analyze`/`index` only when the index is genuinely missing or stale AND the task needs it, always with `--skip-agents-md`, then `git status` + `git checkout --` any tracked file it touched. Before every commit verify no unexpected `.claude/**`, `CLAUDE.md`, `AGENTS.md` or agent-doc changes are staged.

Full policy verbatim: root `AGENTS.md` (canonical). CLI reference, Always/Never-Do rules and skill map: `agent_docs/gitnexus.md`.

<!-- gitnexus:start -->

Indexed as **clawstash** (2191 symbols, 3899 relationships, 189 execution flows). Navigation + workflows: `agent_docs/gitnexus.md`, `.claude/skills/gitnexus/`.

<!-- gitnexus:end -->

<!-- Generated by claude-code-optimizer v1.18.0 -->
