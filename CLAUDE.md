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

| User says...                                      | Skill to load                             |
| ------------------------------------------------- | ----------------------------------------- |
| "done" / "fertig" / "finished" / "/done"          | `.claude/skills/done/SKILL.md`            |
| "PR" / "create PR" / "/pr"                        | `.claude/skills/pr/SKILL.md`              |
| "review" / "/review"                              | `.claude/skills/review/SKILL.md`          |
| "security review" / "/security-review"            | `.claude/skills/security-review/SKILL.md` |
| "rollback" / "revert" / "undo" / "/rollback"      | `.claude/skills/rollback/SKILL.md`        |
| "CI" / "fix CI" / "check the build" / "/ci"       | `.claude/skills/ci/SKILL.md`              |
| "stuck" / "loop" / "going in circles" / "/stuck"  | `.claude/skills/stuck/SKILL.md`           |
| "check dependencies" / "update deps" / "/beacon"  | `.claude/skills/beacon/SKILL.md`          |
| "schedule" / "routine" / "nightly" / "/scheduler" | `.claude/skills/scheduler/SKILL.md`       |
| "orca" / "orchestrator mode" / "/orca"            | `.claude/skills/orca/SKILL.md`            |
| Verify a UI change in a real browser              | `.claude/skills/verify/SKILL.md`          |
| Diagram request                                   | `agent_docs/diagram_prompt.md`            |

> Review runs via the `review` skill -- done-skill does NOT auto-run it. Findings -> `BACKLOG.md` (`agent_docs/backlog_process.md`). Knowledge -> `MEMORY.md` / `SCRATCHPAD.md` (`agent_docs/memory_process.md`).
> **On "done" / "fertig":** commit uncommitted changes, comment on + close the related issue (English), reference it in the commit (`fix: resolve crash #42`). **Do NOT push unless explicitly asked.**

## Output Languages

| Surface                                             | Language                          |
| --------------------------------------------------- | --------------------------------- |
| Chat / status messages to user                      | User's language (default: German) |
| Code, identifiers, comments                         | English                           |
| Commit messages                                     | English (Conventional Commits)    |
| PR titles + bodies                                  | English                           |
| GitHub issue comments                               | English                           |
| Generated files (CLAUDE.md, agent_docs, etc.)       | English                           |
| Console / log output of the app                     | English                           |
| User-facing UI strings                              | English                           |
| **Technical terms -- every surface, chat included** | **English, never translated**     |

**Technical terms are never translated** -- not even inside a German sentence. Keep the English word verbatim and inflect around it: "2 Bugs gefixt", "Code Smell in `db.ts`", "PR gemerged", "Build ist rot" -- never "Programmfehler", "Zusammenführungsantrag". Covers the whole vocabulary of the work (bug, smell, lint, build, commit, merge, branch, PR, review, refactoring, deployment, rollback, issue, hotfix, flaky test, regression, stack trace, dependency, tech debt) plus everything naming something real: file paths, commands, tool / skill / hook names, status labels, error strings (quoted verbatim). Test: English in code, a commit or a PR -> English in chat.

## Performance / Modes

- **Default model:** whatever the session resolves to -- never pin one here or in `.claude/settings.json`; `/model` switches mid-session. **Fast mode** (`/fast`) is the same Opus model with faster output, not a downgrade.
- **Caveman mode:** `caveman lite|full|ultra` / `stop caveman` -- chat only, never generated files. **Orca mode:** `/orca` toggles orchestrator-only work, `/orca <N>` sets the parallel width (default 5); off by default, contract in `.claude/skills/orca/SKILL.md`. **Plan mode** for non-trivial strategy, not for single-step tasks.

Full mode reference: `agent_docs/modes.md`.

## Autonomy

Which session you are in is resolvable, so it is a rule and not a guess: `$CLAUDE_CODE_REMOTE` is `"true"` in Claude Code web/cloud sessions -- routine runs included -- and unset in the local CLI.

- **Unattended** (`CLAUDE_CODE_REMOTE=true`, or the session's initial instructions are a routine): nobody is there to answer. Never end a turn with a question -- decide under an assumption you state, finish every part that isn't blocked, and carry the open point into the final report or `BACKLOG.md`. A routine run has no permission prompts, so a session that "waits for approval" waits forever.
- **Interactive** (local CLI): asking is cheap. Ask when two readings of the task produce materially different work; otherwise decide and mention the call.
- **Both:** an action that is destructive _and_ not ordered _and_ not standard practice gets the same answer either way -- skip it, report it with the recommendation, finish everything it does not block. Gates stay where they are: merges -> `.claude/skills/pr/SKILL.md -> /pr merge`, reversals and force operations -> `.claude/skills/rollback/SKILL.md`, deploys and secrets -> _Deployment_ and `agent_docs/env-vars.md`.

## Scheduled Work

Three schedulers with different lifetimes: **Routines** (cloud, durable, >= 1 h, survive the session), **`/loop` + `CronCreate`/`CronList`/`CronDelete`** (this session only, 7-day expiry), **Desktop scheduled tasks** (local machine). Choosing one, creating/listing/deleting jobs, and the cleanup contract for agent-created jobs: `.claude/skills/scheduler/SKILL.md`. This repo's default prompt for a bare `/loop`: `.claude/loop.md`.

## Project Overview

**ClawStash** is an AI-optimized stash storage system built for AI agents: text and multi-file stashes with tags, metadata, full-text search and version history, exposed through a REST API (Bearer token auth), an MCP server (Streamable HTTP + stdio) and a dark-theme web GUI. Persistence is local SQLite; an optional GitHub backup mirrors stashes into a repo.

User-facing feature list: `README.md`. Backup semantics: `docs/backup.md`.

## Tech Stack

TypeScript 6 (strict, ESM) · Next.js 16 App Router + React 19 · Node.js >= 20.9 (CI + Docker run 26) · SQLite via better-sqlite3 12 · Zod 3.24 · `@modelcontextprotocol/sdk` 1.30 · vitest 4 · ESLint 9 flat + typescript-eslint 8 · Prettier 3.9 · marked / mermaid / diff / PrismJS for rendering · Docker standalone -> GHCR · npm (`package-lock.json`).

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
npm run lint               # ESLint (flat config, correctness rules only)
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

> **ESLint is a correctness gate, not a style one** -- formatting stays entirely with Prettier, and `.claude/` is ignored in both. Scope, type-aware rules, disabled families: `agent_docs/development-notes.md -> Linter scope`.
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
- API route handlers use `checkScope()` / `checkAdmin()` helpers -- no Express-style middleware.
- Max file length: ~300 lines (split), ~500 lines (strongly recommended).

Component style, CSS conventions and the TS compiler settings: `agent_docs/coding-conventions.md`.

## Architecture Principles

- Single-process Next.js app (App Router) -- no separate backend/frontend processes.
- Permissive CORS by design -- ClawStash must be reachable from any AI agent's origin.
- Server validates everything via Zod at the trust boundary; clients are not trusted.

## Architecture Decisions

Significant decisions are recorded as ADRs under `docs/adr/`. Triggers + format: `agent_docs/adr_template.md`. Always grep `docs/adr/` before contradicting an existing decision. To reverse one, add a new ADR with `Status: Supersedes ADR-NNNN` -- never edit accepted ADRs.

## Git Conventions

- **Branch Naming:** `claude/<description>-<shortId>` for agent branches, `feature/<name>` for manual
- **Commit Messages:** Conventional Commits `type(scope): description #issue` (feat, fix, chore, refactor, docs)
- **Merge Strategy:** Squash merge for PRs
- **CI/CD:** `docker-publish.yml` (manual dispatch, Node 26): format:check -> `tsc --noEmit` -> lint -> test -> build, then Docker build + push to GHCR.
- **Cloud / routine runs:** a `claude/`-prefixed branch is always accepted; a push to any other branch is rejected when the branch is protected, carries someone else's open PR, or holds commits authored by someone else. Unattended work therefore starts on `claude/<topic>` unless the task names a branch.
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

Full list + secret locations: `agent_docs/env-vars.md`, `.env.example`. Never `gh secret set` without an explicit user command; `security-review` scans for committed secrets.

## Deployment

- **Trigger:** manual `workflow_dispatch` on `docker-publish.yml` -> multi-stage Docker build -> push to GHCR. Single image, any container host; DB volume at `/app/data`.
- **Agent scope:** push to feature branches, open/update PRs, suggest merge. **Agent does NOT trigger production deploys** without explicit user command.
- **Routine exception:** merges ordered by an owner-authorized routine count as an explicit user command -- conditions + full gate: `.claude/skills/pr/SKILL.md -> /pr merge` (single source of truth).
- **Rollback:** `.claude/skills/rollback/SKILL.md`. Prefer revert-PR over redeploying an old build.

Deployment detail: `docs/deployment.md`.

## API / Interfaces

REST API with Bearer token auth + MCP server (Streamable HTTP + stdio). OpenAPI at `/api/openapi`, MCP spec at `/api/mcp-spec`.

Full reference: `docs/api-reference.md` - MCP tools: `docs/mcp.md` - auth/scopes: `docs/authentication.md`.

## Testing

- **Framework:** vitest 4.x - **Run:** `npm test` (`npm run test:watch` for watch mode)
- **Structure:** colocated `__tests__/` folders under `src/`; vitest collects `src/**/*.{test,spec}.{ts,tsx}`
- **Constraints:** agent-runnable, zero-cost, deterministic -- canonical: `agent_docs/review_process.md -> Test execution constraints`. Config + patterns: `agent_docs/testing.md`.

## External Integrations / MCPs

Project-intended and common MCPs: `agent_docs/mcp_catalog.md`. Never auto-detect host MCP availability -- fall back to standard tools (`Read`, `Bash`, `WebFetch`) when an MCP is absent, and never hard-require one. A server an unattended cloud or routine run needs must be a committed `.mcp.json` entry or a claude.ai connector -- a local `claude mcp add` does not travel with the clone.

**Trigger tools.** `.claude/settings.json` -> `permissions.allow` pre-approves them, so scheduled check-ins, Routine cleanup and PR-watch subscriptions run unattended **wherever this repo's workspace is trusted -- which a web/cloud session never is** (`$CLAUDE_CODE_REMOTE=true`: fresh container, no trust dialog, block dropped at startup); there they keep prompting until the one-time user-scope fix. **Self-heal is local-only:** a tool that still prompts means its server spelling is missing -- append `mcp__<that server>__*` and commit it, additive only, never `deny`/`ask`. Web/cloud appends nothing (it could not take effect in any session) -- name the fix once and carry on. Allowlist shape, both surfaces, user-level fallback: `agent_docs/mcp_catalog.md -> Prompt-free triggers everywhere`.

## CI

CI failure handling: `.claude/skills/ci/SKILL.md`. Triggered by `/ci`, "fix CI", "check the build". Auto-routes by run state (none / running / passed / failed / stale). Never auto-reruns; always verifies fixes locally before pushing.

Which workflows actually run -- `docker-publish.yml` is dispatch-only, so "no runs" on a pushed branch is configuration, not breakage: `agent_docs/development-notes.md -> CI/CD`.

## Subagents

`Explore` (read-only search) - `Plan` (strategy) - `general-purpose` (write+execute) - `claude-code-guide` (Claude Code itself). Direct tools beat subagents when the target is known; parallelize independent calls; pass full context -- subagents have no history. Repo-local agents in `.claude/agents/*.md` load automatically, cloud sessions included -- a `model:` pinned there overrides model inheritance. **Orca mode** (`/orca`) makes delegation the only path and voids the thresholds (`.claude/skills/orca/SKILL.md`). Full guide: `agent_docs/review_process.md -> Subagent Delegation`.

## Development Notes

Runtime + process model, database, Docker and CI/CD specifics: `agent_docs/development-notes.md`. Live gotchas and non-obvious couplings: `MEMORY.md`.

## Refactoring Notes

Refactoring does NOT happen automatically -- only on explicit request, on repeated review smells, or when structure blocks a feature. Principles: `agent_docs/refactoring_guidelines.md` - candidate list with line counts and BACKLOG refs: `agent_docs/development-notes.md -> Refactoring candidates`.

## Documentation Rules

After every code change, check and update:

| File                                      | Update when...                                      |
| ----------------------------------------- | --------------------------------------------------- |
| `CLAUDE.md`                               | New components, configs, patterns, technical detail |
| `README.md`                               | New features, onboarding changes                    |
| `BACKLOG.md`                              | Unresolved review findings                          |
| `MEMORY.md`                               | Decisions, gotchas, deps, user preferences          |
| `SCRATCHPAD.md`                           | Working context, open questions                     |
| `docs/*.md`                               | API, backup, MCP, deployment, auth changes          |
| `docs/ARCHITECTURE.mmd`                   | Modules, data flow or external deps changed         |
| `agent_docs/key-patterns.md`              | Pattern detail not belonging in CLAUDE.md           |
| `.env.example` + `agent_docs/env-vars.md` | New configuration options                           |

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

<!-- Generated by claude-code-optimizer v1.24.0 -->
