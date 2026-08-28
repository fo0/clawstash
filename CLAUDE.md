# CLAUDE.md -- Project Guide

## Session Start -- Read Order

Read in this order, stopping early if a file is missing: `MEMORY.md` (long-term knowledge) -> `SCRATCHPAD.md` (working context) -> `BACKLOG.md` (only if the user references prior findings). `agent_docs/review_process.md`, `memory_process.md` and `mcp_catalog.md` come up on topic; a skill file only when its trigger fires. Don't pre-load everything -- the Tier-1 SessionStart hook prints a reminder.

## Workflow Triggers

Skills live at `.claude/skills/<name>/SKILL.md` -- load the one whose trigger fires. Each skill's full trigger list is its own frontmatter `description`; this is the routing index.

`done` ("done" / "fertig") · `pr` · `review` · `security-review` · `rollback` ("revert" / "undo") · `ci` ("fix CI" / "check the build") · `stuck` ("going in circles") · `beacon` ("check dependencies") · `scheduler` ("routine" / "nightly") · `orca` ("orchestrator mode") · `verify` (UI change in a real browser) · `gitnexus/*` (read-only code intelligence). Diagram request -> `agent_docs/diagram_prompt.md`.

> Review runs via the `review` skill -- done-skill does NOT auto-run it. Findings -> `BACKLOG.md` (`agent_docs/backlog_process.md`). Knowledge -> `MEMORY.md` / `SCRATCHPAD.md` (`agent_docs/memory_process.md`).
> **On "done" / "fertig":** commit uncommitted changes, comment on + close the related issue (English), reference it in the commit (`fix: resolve crash #42`). **Do NOT push unless explicitly asked.**

## Output Languages

- **Chat / status messages to the user:** the user's language (default: German).
- **Everything else is English** -- code, identifiers, comments, app console/log output; commit messages (Conventional Commits); PR titles + bodies; GitHub issue comments; every generated file (`CLAUDE.md`, `agent_docs/*`, MEMORY/SCRATCHPAD/BACKLOG, skills); and user-facing UI strings.
- **Technical terms -- every surface, chat included: English, never translated.**

Not even inside a German sentence: keep the English word verbatim and inflect around it -- "2 Bugs gefixt", "Code Smell in `db.ts`", "PR gemerged", "Build ist rot", never "Programmfehler" or "Zusammenführungsantrag". Same for anything naming something real: file paths, commands, tool / skill / hook names, status labels, error strings (quoted verbatim). Test: English in code, a commit or a PR -> English in chat. Full vocabulary: `agent_docs/coding-conventions.md -> Never-translate term list`.

## Performance / Modes

**Default model:** whatever the session resolves to -- never pin one here or in `.claude/settings.json`; `/fast` is the same Opus model with faster output, not a downgrade. **Caveman mode** (chat compression) starts at `full` every session -- own section below. **Orchestrator mode** (`orca`) is **the default**, width 5 -- see _Subagents_. **Plan mode** for non-trivial strategy, not single-step tasks. Full reference: `agent_docs/modes.md`.

## Caveman Mode -- chat compression (default `full`)

In force from the first reply of every session -- no activation step, no environment check. Chat, status messages and confirmations only; **never** files (`CLAUDE.md`, `agent_docs/*`, MEMORY/SCRATCHPAD/BACKLOG, skills), code, commits, PR bodies or issue comments -- those keep the form _Output Languages_ defines.

- **Shorten by selection, not by compression.** Cut what would not change the reader's next move -- never squeeze prose into abbreviations, arrow chains (`A -> B -> fails`) or invented shorthand.
- Drop articles, filler, pleasantries, hedging. Fragments are fine for a status line. Technical terms exact, code blocks unchanged, error strings verbatim.
- **The closing summary is never compressed** -- outcome first, then what it rests on, in complete sentences, each file/commit/flag in its own plain clause.
- Normal prose for security warnings, irreversible-action confirmations, and whenever fragment order risks a misread.

`caveman lite|full|ultra` switches mode mid-session; **`stop caveman` turns it off** for the rest of the session. Neither carries forward -- the next session starts at `full`.

## Autonomy

`$CLAUDE_CODE_REMOTE` is `"true"` in web/cloud sessions (routine runs included) and unset in the local CLI -- resolvable, so a rule and not a guess.

- **Unattended:** never end a turn with a question -- decide under a stated assumption, finish everything unblocked, carry the open point into the report or `BACKLOG.md`. **Interactive:** ask only when two readings mean materially different work.
- **Report against evidence, not intent** -- tie every "done" to a tool result from this session; unverified is named unverified, skipped is named skipped.
- **Both:** destructive _and_ not ordered _and_ not standard practice -> skip it, recommend it, finish the rest. Gates: merges -> `/pr merge`, reversals/force -> `rollback` skill, deploys + secrets -> _Deployment_ and `agent_docs/env-vars.md`.

Full wording: `agent_docs/autonomy.md`.

## Handoff Prompt -- when a turn ends on a decision

A turn that hands the decision back -- a plan put up for approval, options, an open question, an ambiguity you could not resolve -- ends with **one** ready-to-send prompt: the one you would send yourself if your recommendation were taken. It goes last, _after_ the question, never instead of it.

```
<objective in one sentence> -- <the recommended path>.
In scope: <...>. Out of scope: <...>.
Steps: <1 ... n>. /review after every step, one overall review over the combined diff at the end by an agent that wrote none of it, then /done.
Done when: <observable condition>.
```

- **Your recommendation, not a menu.** One path, spelled out completely enough that pasting it is the whole instruction.
- **Only commands that already exist:** this project's `/review` and `/done`, plus Claude Code's own `/loop <interval> <prompt>` (recurring pass, or waiting on external state) and `/goal <done-condition>` (sent first where the run must not stop before that condition holds). Never invent one.
- **Never compressed**, whatever the caveman mode -- same carve-out as the closing summary.

**Not on:** a finished turn, a yes/no confirmation of something just ordered (`/pr merge`, a `rollback` phase), and never in an unattended run, where _Autonomy_ rules out the question anyway.

## Scheduled Work

Three lifetimes: **Routines** (cloud, durable, >= 1 h), **`/loop` + `Cron*`** (this session, 7-day expiry), **Desktop tasks** (local machine). Selection, job management, cleanup contract: `.claude/skills/scheduler/SKILL.md`. Bare `/loop`: `.claude/loop.md`.

## Project Overview

**ClawStash** is an AI-optimized stash storage system built for AI agents: text and multi-file stashes with tags, metadata, full-text search and version history, exposed through a REST API (Bearer token auth), an MCP server (Streamable HTTP + stdio) and a dark-theme web GUI. Persistence is local SQLite; an optional GitHub backup mirrors stashes into a repo. Feature list: `README.md`. Backup semantics: `docs/backup.md`.

## Tech Stack

TypeScript 6 (strict, ESM) · Next.js 16 App Router + React 19 · Node.js >= 20.9 (CI + Docker run 26) · SQLite via better-sqlite3 12 · Zod 3.24 · `@modelcontextprotocol/sdk` 1.30 · vitest 4 · ESLint 9 flat + typescript-eslint 8 · Prettier 3.9 · marked / mermaid / diff / PrismJS for rendering · Docker standalone -> GHCR · npm (`package-lock.json`). Exact versions: `package.json`.

## Project Structure

```
src/
  app/          # App Router: pages, /api handlers, /mcp endpoint
  components/   # React UI (+ editor/ settings/ api/ shared/)
  server/       # DB, auth, validation, MCP, OpenAPI (+ stores/ backup/)
  hooks/ utils/ styles/
docs/ (user docs + ARCHITECTURE.mmd + adr/), agent_docs/, .claude/skills/, scripts/, public/
```

Full tree: `agent_docs/project-structure.md`.

## Commands

```bash
# Install
npm install

# Development
npm run dev                # Next.js dev server (frontend + API, port 3000)

# Automated Checks -- CI's own order (docker-publish.yml), format FIRST
npm run format             # Prettier write (done-skill auto-invokes before commit)
npm run format:check       # Prettier check (matches CI; read-only)
npx tsc --noEmit           # Type checking
npm run lint               # ESLint (flat config, correctness rules only)
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

> The chain mirrors `docker-publish.yml` exactly, which deviates twice from the usual order: typecheck runs **before** lint, and test **before** build. Keep local runs in that order so a red step here is the same red step in CI. ESLint is a correctness gate, not a style one: scope, type-aware rules and disabled families live in `agent_docs/development-notes.md -> Linter scope`; the read-only GitNexus CLI in `agent_docs/gitnexus.md`.

## Key Patterns

Top-5 index -- all patterns in full: `agent_docs/key-patterns.md`.

- **Database Layer** -- `ClawStashDB`, SQLite + WAL, FTS5 search, version history, access log; delegates to `src/server/stores/`. `src/server/db.ts`
- **DB Singleton** -- `globalThis`-backed `getDb()` survives Next.js HMR. `src/server/singleton.ts`
- **Spec Architecture (SoT)** -- `tool-defs.ts` + `shared-text.ts` feed OpenAPI, MCP spec and frontend API tabs.
- **Authentication** -- admin sessions (`csa_`) + API tokens (`cs_`), scopes admin > write > read. `src/server/auth.ts`
- **Middleware + Rate Limiter** -- permissive CORS, security headers, per-IP auth rate limiting, `TRUST_PROXY` gate. `src/middleware.ts`, `auth-rate-limit.ts`

**Error handling:** try/catch in async route handlers; error state in React components; validation errors through `formatZodError()`.

## Coding Conventions

The ones Prettier and ESLint do not already enforce:

- `.claude/` stays excluded in `.prettierignore` -- GitNexus rewrites its skill files unformatted, so keep that exclusion.
- Named imports; `@/*` path aliases for server-side imports in route handlers.
- API route handlers use `checkScope()` / `checkAdmin()` helpers -- no Express-style middleware.
- Max file length: ~300 lines (split), ~500 lines (strongly recommended).

Language, module system, component + CSS style, error handling, TS compiler settings: `agent_docs/coding-conventions.md`.

## Architecture Principles

- Single-process Next.js app (App Router) -- no separate backend/frontend processes.
- Permissive CORS by design -- ClawStash must be reachable from any AI agent's origin.
- Server validates everything via Zod at the trust boundary; clients are not trusted.

## Architecture Decisions

ADRs live under `docs/adr/`; triggers + format: `agent_docs/adr_template.md`. Grep `docs/adr/` before contradicting a decision; reverse one only via a new ADR with `Status: Supersedes ADR-NNNN` -- never edit accepted ADRs.

## Git Conventions

- **Branch Naming:** `claude/<description>-<shortId>` for agent branches, `feature/<name>` for manual
- **Commit Messages:** Conventional Commits `type(scope): description #issue` (feat, fix, chore, refactor, docs)
- **Merge Strategy:** Squash merge for PRs
- **CI/CD:** `docker-publish.yml` (manual dispatch, Node 26): format:check -> `tsc --noEmit` -> lint -> test -> build, then Docker build + push to GHCR. `docs-format.yml` gates `**.md`.
- **Cloud / routine runs:** a `claude/`-prefixed branch is always accepted; a push to any other branch is rejected when the branch is protected, carries someone else's open PR, or holds commits authored by someone else. Unattended work therefore starts on `claude/<topic>` unless the task names a branch.
- **Formatting guard (optional):** husky + lint-staged auto-format on commit -- `agent_docs/ci_formatting_guard.md`. Never bypass with `--no-verify`.

## Dependency Management

New runtime dependencies only after user approval with reasoning; devDependencies fine without for tooling/testing. Lock file `package-lock.json` -- always commit.

## Environment Variables

| Variable                   | Description                       | Default               |
| -------------------------- | --------------------------------- | --------------------- |
| `DATABASE_PATH`            | SQLite database file              | `./data/clawstash.db` |
| `ADMIN_PASSWORD`           | Admin login (unset = open access) | --                    |
| `CLAWSTASH_ENCRYPTION_KEY` | Secrets at rest, 64 hex chars     | auto-generated        |

Full list (incl. `PORT`, `TRUST_PROXY`) + secret locations: `agent_docs/env-vars.md`, `.env.example`. Never `gh secret set` without an explicit user command; `security-review` scans for committed secrets.

## Deployment

- **Trigger:** manual `workflow_dispatch` on `docker-publish.yml` -> multi-stage Docker build -> push to GHCR. Single image, any container host; DB volume at `/app/data`.
- **Agent scope:** feature branches, open/update PRs, suggest merge -- **no production deploys** without an explicit user command. The one exception (an owner-authorized routine's merge) + full gate: `.claude/skills/pr/SKILL.md -> /pr merge`.
- **Rollback:** `.claude/skills/rollback/SKILL.md` -- prefer a revert-PR. Detail: `docs/deployment.md`.

## API / Interfaces

REST API with Bearer token auth + MCP server (Streamable HTTP + stdio). OpenAPI at `/api/openapi`, MCP spec at `/api/mcp-spec`.

Full reference: `docs/api-reference.md` -- MCP tools: `docs/mcp.md` -- auth/scopes: `docs/authentication.md`.

## Testing

vitest 4.x -- `npm test` (`npm run test:watch` to watch). Colocated `__tests__/` folders under `src/`; vitest collects `src/**/*.{test,spec}.{ts,tsx}`. Constraints (agent-runnable, zero-cost, deterministic): `agent_docs/review_process.md -> Test execution constraints`. Config + patterns: `agent_docs/testing.md`.

## External Integrations / MCPs

Project-intended MCPs (`gitnexus`, `github`, ClawStash's own server), cloud/routine reachability, the allowlist shape and both permission surfaces: `agent_docs/mcp_catalog.md`. Never auto-detect host availability -- fall back to `Read` / `Bash` / `WebFetch`, never hard-require an MCP. **Trigger-tool self-heal is local-only** and additive (append the missing `mcp__<server>__*` glob, never `deny`/`ask`); a web/cloud session drops the block, so append nothing there -- `agent_docs/mcp_catalog.md -> Prompt-free triggers everywhere`.

## CI

CI failure handling: `.claude/skills/ci/SKILL.md`. Auto-routes by run state; never auto-reruns; verifies fixes locally first. `docker-publish.yml` is dispatch-only, so "no runs" on a pushed branch is configuration, not breakage: `agent_docs/development-notes.md -> CI/CD`.

## Subagents -- orchestrator mode is the default

**Every session starts in orchestrator mode, width 5.** The main agent decides and delegates; subagents do the task work. `/orca <N>` changes the width, `/orca off` drops to plain behavior for that session only. The orchestrator keeps only the decisions: decomposition, verification of what comes back, the integration gates, the report. Contract: `.claude/skills/orca/SKILL.md`.

**The role carries the lens**, and the wave report names it:

| Role          | Earns a seat when                             |
| ------------- | --------------------------------------------- |
| `implementer` | always, for any code change                   |
| `reviewer`    | **any code change -- never its author**       |
| `architect`   | the change crosses or moves a boundary        |
| `domain`      | it encodes a domain or business rule          |
| `product`     | the request is ambiguous or scope could drift |
| `docs`        | a documented interface or contract changes    |
| `security`    | trust boundaries, untrusted input or secrets  |

Seat the lenses the change calls for, never two with the same one. **Quality parity by omission:** leave model and effort off and the subagent inherits the session's (a `model:` pinned in `.claude/agents/*.md` overrides). Disjoint write scopes per wave; verify the diff, not the summary. Types + task -> type mapping: `agent_docs/review_process.md -> Subagent Delegation`.

## Development Notes

Runtime + process model, database, Docker and CI/CD specifics: `agent_docs/development-notes.md`. Live gotchas and non-obvious couplings: `MEMORY.md`.

## Refactoring Notes

Never automatic -- explicit request, repeated review smells, or structure blocking a feature only. Principles: `agent_docs/refactoring_guidelines.md`; candidates with line counts + BACKLOG refs: `agent_docs/development-notes.md -> Refactoring candidates`.

## Documentation Rules

After every code change, check and update: `CLAUDE.md` (new components, configs, patterns, technical detail) · `README.md` (new features, onboarding) · `BACKLOG.md` (unresolved review findings) · `MEMORY.md` (decisions, gotchas, deps, user preferences) · `SCRATCHPAD.md` (working context, open questions) · `docs/*.md` (API, backup, MCP, deployment, auth changes) · `docs/ARCHITECTURE.mmd` (modules, data flow or external deps changed) · `agent_docs/key-patterns.md` (pattern detail not belonging in CLAUDE.md) · `.env.example` + `agent_docs/env-vars.md` (new configuration options).

### Context budget

`CLAUDE.md`, `MEMORY.md` and `SCRATCHPAD.md` load every session, so they are budgeted: **15k / 8k / 4k** target, offload at **20k / 16k / 8k**. `agent_docs/`, `.claude/skills/` and `docs/` are read on demand and unbudgeted.

Over budget -> **move** content out and leave a one-line pointer (never delete to fit, never summarize detail away). Ladder + archive format: `agent_docs/context_budget.md`. The Tier-1 budget guard flags it after any Edit/Write; act in the same session.

<!-- The GitNexus policy below is intentionally OUTSIDE the gitnexus:start/end markers so `gitnexus analyze` cannot overwrite it. Do not move it inside the markers. -->

## GitNexus -- Read-Only Analysis Policy (non-negotiable)

GitNexus is **analysis/read-only** and must never write to this repository -- read-only tools only (`gitnexus_query`, `_impact`, `_context`, `_detect_changes`, `status`/`list`), never `gitnexus_rename`, `wiki` or skill/doc generation, and `analyze`/`index` only with `--skip-agents-md` followed by `git checkout --` on every tracked file it touched. `git status` before every commit; revert unexpected `.claude/**` / `CLAUDE.md` / `AGENTS.md` / agent-doc changes.

Full policy verbatim: root `AGENTS.md` (canonical). CLI, Always/Never-Do rules, skill map: `agent_docs/gitnexus.md`.

<!-- gitnexus:start -->

Indexed as **clawstash** (2191 symbols, 3899 relationships, 189 execution flows). Navigation + workflows: `agent_docs/gitnexus.md`, `.claude/skills/gitnexus/`.

<!-- gitnexus:end -->

<!-- Generated by claude-code-optimizer v1.30.0 -->
