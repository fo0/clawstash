# MCP Catalog

This file documents:

1. **Common MCPs** the agent may encounter in any Claude Code environment.
2. **This project's intended MCPs** -- declared by the user, not detected from the host.

> **Cross-machine rule:** the optimizer never auto-detects which MCPs are installed locally. The catalog reflects intent + reference, not host probe. If a listed MCP isn't installed on the current machine, the agent silently falls back to non-MCP equivalents (Read / Bash / WebFetch / etc.) and notes once: `MCP <name> not available locally -- falling back to standard tools.`

## Project MCPs (intended for this project)

> Edit this list when adding/removing MCP integrations from the project. The optimizer preserves user edits on re-run.

| MCP                        | Purpose in this project                                                                                                | Notes                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `gitnexus`                 | Code intelligence -- symbol graph, impact, refactor for the clawstash TS/Next.js code                                  | Run `npx gitnexus analyze` to (re)build the local index. Index lives in `.gitnexus/` (gitignored). |
| `github`                   | Repo / issue / PR metadata when the `gh` CLI is unavailable in the host environment                                    | Skill files (`pr`, `ci`) prefer `gh` CLI when available; MCP is a fallback only.                   |
| Clawstash's own MCP server | The application under development exposes its own MCP server at `/mcp` (Streamable HTTP) and via `npm run mcp` (stdio) | Used for end-to-end testing of MCP tools the project ships -- not for agent task automation.       |

## Common MCPs (reference -- not necessarily used here)

| MCP                             | Typical use                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------- |
| `gitnexus`                      | Code intelligence -- symbol graph, impact, refactor (manifest-driven feature in this optimizer) |
| `filesystem`                    | Sandboxed file access beyond CWD                                                                |
| `github`                        | Issue / PR / repo metadata via API (alternative to `gh`)                                        |
| `postgres` / `mysql` / `sqlite` | Live DB schema introspection + read queries                                                     |
| `puppeteer` / `playwright`      | Headless browser, used for UI automation, scraping, e2e                                         |
| `fetch`                         | HTTP fetch wrapper                                                                              |
| `slack`                         | Read/post messages -- for ops integrations                                                      |
| `sentry`                        | Error tracking lookup                                                                           |
| `notion` / `linear` / `jira`    | Work tracking integrations                                                                      |
| `aws` / `gcp` / `azure`         | Cloud resource queries (use carefully -- non-zero cost)                                         |

## Selection Heuristic for the Agent

1. **Project MCPs first.** If the project intends an MCP for a task, use it.
2. **Common-MCP fallback.** For tasks that fit a common MCP, try it; if unavailable, fall back to standard tools.
3. **Never make MCP usage a hard requirement.** All workflows must work without MCPs (autonomy + cross-machine rule).
4. **Never call cost-incurring MCPs** (cloud, paid APIs) unless explicitly requested by the user.

## Adding a New Project MCP

1. Add a row to the **Project MCPs** table above with purpose + notes.
2. If the MCP needs setup, document the install/auth steps in CLAUDE.md "External Integrations" section.
3. If a workflow becomes MCP-dependent, add a fallback path that works without it.
