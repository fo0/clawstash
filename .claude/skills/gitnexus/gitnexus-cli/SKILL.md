---
name: gitnexus-cli
description: 'Use for read-only GitNexus index maintenance: check index status, list indexed repos, register or (re)build the index. Examples: "Is the GitNexus index current?", "List indexed repos", "Register this repo"'
---

# GitNexus CLI Commands

All commands work via `npx` — no global install required.

> **Read-only / analysis only.** GitNexus must never write tracked files. These commands manage the **index** (`.gitnexus/`, gitignored) and the global registry (`~/.gitnexus/`) only. `analyze` is the one command that *can* touch `CLAUDE.md` / `AGENTS.md` — always pass `--skip-agents-md`, run it only when genuinely needed, and revert any tracked file it changes. Wiki/doc generation is **not used** under this policy. See the Read-Only Analysis Policy in CLAUDE.md / AGENTS.md.

## Commands

### analyze — (re)build the index — index-only, not routine

```bash
npx gitnexus analyze --skip-agents-md
```

Run from the project root. This parses all source files, builds the knowledge graph, and writes it to `.gitnexus/` (gitignored). **Always pass `--skip-agents-md`** — without it, `analyze` ALSO rewrites the optimizer-managed CLAUDE.md / AGENTS.md context sections. Run `analyze` **only** when the index is genuinely missing/stale AND the current task needs it; it is not a routine step.

| Flag                | Effect                                                           |
| ------------------- | ---------------------------------------------------------------- |
| `--skip-agents-md`  | Preserve AGENTS.md/CLAUDE.md sections — **mandatory on every analyze** |
| `--force`           | Force full re-index even if up to date                           |
| `--embeddings`      | Enable embedding generation for semantic search (off by default) |
| `--drop-embeddings` | Drop existing embeddings on rebuild (default: preserve them)     |

> **Mandatory revert guard:** even with `--skip-agents-md`, after any `analyze` run `git status` and `git checkout -- <paths>` for any tracked file it touched (`.claude/**`, `CLAUDE.md`, `AGENTS.md`, `docs/wiki/**`). Only `analyze` writes tracked files — `status`, `index`, and `list` never do. The index itself (`.gitnexus/`) stays gitignored and uncommitted — never in a commit or PR.

**When to run:** only when `gitnexus://repo/{name}/context` (or `status`) reports the index missing/stale **and** the task needs a fresh index. **There is no auto-analyze hook** — GitNexus is analysis-only; index freshness is on-demand, never enforced on every commit/merge.

### index — Register repo in global registry

```bash
npx gitnexus index .
```

Registers the current repo in `~/.gitnexus/registry.json` so MCP tools can find it. Use this when `gitnexus_query` returns empty results despite a local `.gitnexus/` directory existing — the local index is fine but the global registry doesn't know about it.

### status — Check index freshness

```bash
npx gitnexus status
```

Shows whether the current repo has a GitNexus index, when it was last updated, and symbol/relationship counts. Use this to check if re-indexing is needed.

### clean — Delete the index

```bash
npx gitnexus clean
```

Deletes the `.gitnexus/` directory and unregisters the repo from the global registry. Use before re-indexing if the index is corrupt or after removing GitNexus from a project.

| Flag      | Effect                                            |
| --------- | ------------------------------------------------- |
| `--force` | Skip confirmation prompt                          |
| `--all`   | Clean all indexed repos, not just the current one |

### wiki — disabled under the read-only policy

`npx gitnexus wiki` generates documentation files (e.g. under `docs/wiki/**`) from the graph — that is a **write** operation, so it is **out of scope** here. Do not run it as part of any task. If the user explicitly asks for generated docs, treat that as a separate, explicitly-requested task — never an automatic GitNexus side-effect.

### list — Show all indexed repos

```bash
npx gitnexus list
```

Lists all repositories registered in `~/.gitnexus/registry.json`. The MCP `list_repos` tool provides the same information.

## After Indexing

1. **Read `gitnexus://repo/{name}/context`** to verify the index loaded
2. Use the other GitNexus skills (`exploring`, `debugging`, `impact-analysis`, `refactoring`) for your task

## Troubleshooting

- **"Not inside a git repository"**: Run from a directory inside a git repo
- **MCP tools return empty for known repo**: run `npx gitnexus index .` to register
- **Index is stale after re-analyzing**: Restart the MCP host (e.g. Claude Code) to reload the MCP server
- **Embeddings slow**: Omit `--embeddings` (off by default) or set `OPENAI_API_KEY` for faster API-based embedding
