# MCP Catalog

This file documents:

1. **Common MCPs** the agent may encounter in any Claude Code environment.
2. **This project's intended MCPs** -- declared by the user, not detected from the host.

> **Cross-machine rule:** the optimizer never auto-detects which MCPs are installed locally. The catalog reflects intent + reference, not host probe. If a listed MCP isn't installed on the current machine, the agent silently falls back to non-MCP equivalents (Read / Bash / WebFetch / etc.) and notes once: `MCP <name> not available locally -- falling back to standard tools.`

## Project MCPs (intended for this project)

> Edit this list when adding/removing MCP integrations from the project. The optimizer preserves user edits on re-run.

| MCP                        | Purpose in this project                                                                                                | Notes                                                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `gitnexus`                 | Code intelligence -- symbol graph, impact, refactor for the clawstash TS/Next.js code                                  | Read-only per CLAUDE.md policy. Rebuild only when needed: `npx gitnexus analyze --skip-agents-md`. Index lives in `.gitnexus/` (gitignored). |
| `github`                   | Repo / issue / PR metadata when the `gh` CLI is unavailable in the host environment                                    | Skill files (`pr`, `ci`) prefer `gh` CLI when available; MCP is a fallback only.                                                             |
| Clawstash's own MCP server | The application under development exposes its own MCP server at `/mcp` (Streamable HTTP) and via `npm run mcp` (stdio) | Used for end-to-end testing of MCP tools the project ships -- not for agent task automation.                                                 |

## Common MCPs (reference -- not necessarily used here)

| MCP                             | Typical use                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gitnexus`                      | Code intelligence -- symbol graph, impact, refactor (manifest-driven feature in this optimizer)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `filesystem`                    | Sandboxed file access beyond CWD                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `github`                        | Issue / PR / repo metadata via API (alternative to `gh`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `claude-code-remote`            | Claude Code web/remote session management -- scheduled Routines/triggers, `send_later` self check-ins, PR-activity subscriptions. All of its tools are pre-approved in `.claude/settings.json` -> `permissions.allow` via a per-spelling `mcp__...__*` glob (optimizer feature "Agent trigger permissions"), so autonomous check-ins never stall on approval prompts -- no per-tool carve-outs. PR-activity subscribe/unsubscribe may register under the `github` server instead -- both spellings are covered. See _Allowlist shape_ below |
| `postgres` / `mysql` / `sqlite` | Live DB schema introspection + read queries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `puppeteer` / `playwright`      | Headless browser, used for UI automation, scraping, e2e                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `fetch`                         | HTTP fetch wrapper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `slack`                         | Read/post messages -- for ops integrations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `sentry`                        | Error tracking lookup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `notion` / `linear` / `jira`    | Work tracking integrations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `aws` / `gcp` / `azure`         | Cloud resource queries (use carefully -- non-zero cost)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Allowlist shape (`.claude/settings.json` -> `permissions.allow`)

The list is glob-first and deliberately minimal:

- **Keep exactly one `mcp__<server>__*` glob per Claude Code Remote spelling** (`claude-code-remote`, `Claude_Code_Remote`, `claude_code_remote`). A glob covers every current and future tool of that server, so autonomous check-ins never stall on an approval prompt.
- **Per-tool entries already matched by a glob in the same list are redundant** -- they were pruned (2026-08-02, owner decision) and **must not be re-added**. Only `mcp__github__subscribe_pr_activity` / `mcp__github__unsubscribe_pr_activity` remain per-tool, because there is no `mcp__github__*` glob; if such a glob is ever added, those two become redundant too and go with it.
- **Self-heal by appending a glob.** A tool that still prompts means its server spelling is missing from the list -- append `mcp__<that server>__*` and commit it on the current branch/PR. Never widen by adding individual tool names.
- **Never write `deny`/`ask`** in this file. Re-gating is the user's call in their own settings (below), never the agent's in the repo.
- Never remove a glob, and never touch entries for a server you are not fixing.

> `.prettierignore` excludes `.claude/`, so a format run never reaches this file -- keep the JSON hand-formatted (2-space indent) and keep that exclusion.

## Prompt-free triggers everywhere (one-time, optional)

This repo's `.claude/settings.json` already pre-approves every Claude Code Remote trigger tool. Two things can still get in the way: `permissions.allow` from a **project** settings file applies only after the **workspace-trust dialog** for this repo has been accepted, and a repo that never ran the optimizer has no such block at all. Both are solved once, per machine, by putting the same rules into the **user-level** `~/.claude/settings.json` -- user settings carry no trust gate and apply to every repo:

```json
{
  "permissions": {
    "allow": [
      "mcp__claude-code-remote__*",
      "mcp__Claude_Code_Remote__*",
      "mcp__claude_code_remote__*",
      "mcp__github__subscribe_pr_activity",
      "mcp__github__unsubscribe_pr_activity"
    ]
  }
}
```

Merge into an existing file without clobbering rules you did not add; the same glob-first shape applies (per-tool entries a glob already covers are redundant). To re-gate a single tool (e.g. `add_repo`), add it to `permissions.ask` -- `ask` is evaluated before `allow`, so it prompts despite the glob. **The agent never writes this file on its own, and never writes `deny`/`ask` anywhere** -- this file lives outside the repo, so applying it is the user's call.

## Selection Heuristic for the Agent

1. **Project MCPs first.** If the project intends an MCP for a task, use it.
2. **Common-MCP fallback.** For tasks that fit a common MCP, try it; if unavailable, fall back to standard tools.
3. **Never make MCP usage a hard requirement.** All workflows must work without MCPs (autonomy + cross-machine rule).
4. **Never call cost-incurring MCPs** (cloud, paid APIs) unless explicitly requested by the user.

## Adding a New Project MCP

1. Add a row to the **Project MCPs** table above with purpose + notes.
2. If the MCP needs setup, document the install/auth steps in CLAUDE.md "External Integrations" section.
3. If a workflow becomes MCP-dependent, add a fallback path that works without it.
