# GitNexus -- Code Intelligence (read-only)

Navigation and CLI reference for this repo. Detailed workflows live in `.claude/skills/gitnexus/`.

## Read-Only Analysis Policy (non-negotiable)

**Canonical text: root-level `AGENTS.md`** — the guard-rail copy an agent sees without opening this file. CLAUDE.md carries the condensed version. Everything below is subordinate to it; if this file and `AGENTS.md` ever disagree, `AGENTS.md` wins.

## CLI (read-only)

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
- Index directory `.gitnexus/` is gitignored.
- If `gitnexus_query` returns empty for a known symbol, the local index may not be in the global registry -- `npx gitnexus index .` registers it (writes only `~/.gitnexus`, no tracked files).

## Always Do — when GitNexus is available

Per CLAUDE.md, no workflow may hard-require an MCP: when GitNexus is absent, fall back to `Read` / `grep` and say so once. When it _is_ available, these are mandatory:

- Run `gitnexus_impact({target: "symbolName", direction: "upstream"})` before modifying a function, class, or method, and report the blast radius (direct callers, affected processes, risk level) to the user.
- Run `gitnexus_detect_changes()` before committing to verify your changes only affect expected symbols and execution flows.
- Warn the user when impact analysis returns HIGH or CRITICAL risk, before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol -- callers, callees, which execution flows it participates in -- use `gitnexus_context({name: "symbolName"})`.

## Never Do — unconditional

These hold whether or not GitNexus is available, and are the binding half of the policy in `AGENTS.md`:

- NEVER use GitNexus to write or modify files -- no `gitnexus_rename`, no `wiki`, no skill/doc generation. GitNexus is read-only. To rename, use `gitnexus_impact` / `gitnexus_context` to enumerate every reference, then edit them yourself with normal tools.
- NEVER run `npx gitnexus analyze` without `--skip-agents-md`, and NEVER commit any file a GitNexus command touched -- `git checkout --` them. GitNexus must never rewrite `.claude/**`, `CLAUDE.md`, `AGENTS.md`, or `docs/wiki/**`.
- NEVER ignore a HIGH or CRITICAL risk warning that impact analysis did return.

## Resources

This project is indexed by GitNexus as **clawstash** (2191 symbols, 3899 relationships, 189 execution flows).

| Resource                                   | Use for                                  |
| ------------------------------------------ | ---------------------------------------- |
| `gitnexus://repo/clawstash/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/clawstash/clusters`       | All functional areas                     |
| `gitnexus://repo/clawstash/processes`      | All execution flows                      |
| `gitnexus://repo/clawstash/process/{name}` | Step-by-step execution trace             |

## Skill Files

This table is the complete list -- `.claude/skills/gitnexus/` holds exactly these eight and nothing else. If `analyze` regenerates extra near-duplicate directories (`gitnexus-explore`, `gitnexus-debug`, `gitnexus-impact`), delete them again: they shipped a stale-index instruction that omitted `--skip-agents-md`.

| Task                                                                       | Read this skill file                                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?"                               | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"                                | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"                                           | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Plan a refactor -- read-only impact / reference mapping (you do the edits) | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Verify a diff / PR -- what did my changes affect?                          | `.claude/skills/gitnexus/gitnexus-review/SKILL.md`          |
| Custom graph queries (unused exports, cycles, metrics)                     | `.claude/skills/gitnexus/gitnexus-query/SKILL.md`           |
| Tools, resources, schema reference                                         | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index status / list / register (read-only CLI)                             | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |
