# Hooks Catalog -- Tier-2/3

Ready-to-paste hook snippets that enforce optimizer rules beyond the Tier-1 minimum in `.claude/settings.json`. Copy what fits, paste into `.claude/settings.json` under the matching trigger.

> **Tier-1 hooks** (already in `.claude/settings.json`): GitNexus read-only pre-commit guard (no auto-analyze), context budget guard (CLAUDE.md / MEMORY.md / SCRATCHPAD.md), quality-config guard (a `PreToolUse` deny on `.prettierrc.json` / `eslint.config.js` / `tsconfig.json` -- a red check is fixed in the code, never by weakening the rule that caught it), SessionStart memory reminder.
> **Tier-2** = recommended, default off -- copy if relevant.
> **Tier-3** = optional, situational -- copy only if you actively want the behavior.

## How to use

1. Open `.claude/settings.json`.
2. Find the matching trigger (`PostToolUse`, `PreToolUse`, `Stop`, `PreCompact`, `UserPromptSubmit`).
3. Append the snippet's hook entry to the trigger's array. Don't duplicate matchers -- merge into existing matcher's `hooks` list.

## Reaching the agent (read before writing your own)

Plain stdout from a hook is **only** added to the model's context on `SessionStart`, `UserPromptSubmit`, and `UserPromptExpansion`. On `PreToolUse`, `PostToolUse`, `Stop` and friends it goes to the debug log -- an `echo 'WARNING: ...'` there is invisible to both agent and user. To actually reach the agent, print this JSON to stdout and exit 0:

```
{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"...message..."}}
```

Supported on `SessionStart`, `SubagentStart`, `UserPromptSubmit`, `UserPromptExpansion`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SubagentStop` -- **not** on `PreCompact`, `SessionEnd`, `Notification`. Build the JSON with `jq -nc --arg m "$msg" '...'` whenever the message contains captured output, so quotes and newlines stay escaped. Alternatives: exit 2 + stderr (blocks the call on `PreToolUse`), `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask"}}` (forces the permission prompt), `{"systemMessage":"..."}` (shown to the user, not the agent).

**Two levers most catalogs miss.** `$CLAUDE_CODE_REMOTE` is `"true"` in web/cloud sessions and unset in the local CLI -- the one _resolvable_ test for "is a human watching", which is what makes an autonomy-conditional hook legal (CLAUDE.md -> _Autonomy_). And a hook entry is not only a shell command: `"type"` also accepts `"http"`, `"mcp_tool"`, `"prompt"` (LLM yes/no) and `"agent"`, entries take `"timeout"` and an `"if"` condition, and `${CLAUDE_PROJECT_DIR}` expands inside `command`. Events beyond the ones used below: `Setup`, `PostCompact`, `SessionEnd`, `PermissionRequest`, `PermissionDenied`, `PostToolUseFailure`, `SubagentStart`/`SubagentStop`, `TaskCreated`/`TaskCompleted`, `ConfigChange`, `FileChanged` -- reach for one of those before inventing a polling loop.

Each snippet below states its **Trigger** and, where it matters, whether it is agent-facing or user-facing.

---

## Tier 2 -- Recommended

> **MEMORY.md / SCRATCHPAD.md size warnings are no longer here** -- since v1.18.0 they are part of the Tier-1 **context budget guard** in `.claude/settings.json`, which checks all three budgeted files (`CLAUDE.md` 20k, `MEMORY.md` 16k, `SCRATCHPAD.md` 8k) in a single `PostToolUse` hook and points at `agent_docs/context_budget.md`. Nothing to paste; adjust the thresholds there if this project needs different ones.

### Write -- stray doc-file warning

```json
{
  "matcher": "Write",
  "hooks": [
    {
      "type": "command",
      "command": "f=$(jq -r '.tool_input.file_path // empty'); case \"$f\" in *.md|*.txt) ;; *) exit 0;; esac; case \"$f\" in docs/*|*/docs/*|agent_docs/*|*/agent_docs/*|.claude/*|*/.claude/*|.github/*|*/.github/*) exit 0;; esac; case \"${f##*/}\" in README.md|CLAUDE.md|AGENTS.md|CONTRIBUTING.md|CHANGELOG.md|LICENSE.md|SECURITY.md|MEMORY.md|SCRATCHPAD.md|BACKLOG.md|SKILL.md) exit 0;; esac; printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"New standalone .md/.txt outside the documented homes. The agent docs already have one: an architecture decision goes to docs/adr/, a repo gotcha to MEMORY.md, working notes to SCRATCHPAD.md, an unfixed finding to BACKLOG.md, a process to agent_docs/. Write the file anyway only if it is a deliverable the project asked for -- see agent_docs/context_budget.md.\"}}'; exit 0"
    }
  ]
}
```

Trigger: `PreToolUse`. Agent-facing, **non-blocking** -- it names the right home and lets the agent proceed, because a genuine deliverable is indistinguishable from sprawl at hook time.

**Why this exists next to the budget guard.** The Tier-1 budget guard measures three files. It is blind to the other half of context rot: the `SUMMARY.md`, `NOTES.md`, `IMPLEMENTATION_PLAN.md`, `REFACTOR_PLAN.md` layer an agent leaves behind across sessions. Each one is individually small and permanently under every threshold, so nothing ever fires -- and the next session greps a root full of half-true snapshots that no rule ever updates. The homes in the message are the ones `memory_process.md` and `backlog_process.md` already define; the hook only makes the agent meet them at the moment it is about to write past them.

**Allowlist maintenance:** the basename list is the set of files this repo has agreed to keep at root, and the directory list is everything that is unbudgeted by design. Add a project's own root-level docs to the basename list rather than deleting the hook.

### Stop -- scratchpad cleanup reminder

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "printf '%s' '{\"systemMessage\":\"Session ending -- verify SCRATCHPAD.md is clean. Promote stable entries to MEMORY.md per memory_process.md.\"}'"
    }
  ]
}
```

Trigger: `Stop`. **User-facing** by design: `additionalContext` on `Stop` would resume the turn so the agent can act on it -- not what an end-of-session reminder should do.

### PreCompact -- dump scratchpad state

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "f=\"$CLAUDE_PROJECT_DIR/SCRATCHPAD.md\"; [ -f \"$f\" ] && cp \"$f\" \"$CLAUDE_PROJECT_DIR/.claude/scratchpad-precompact.bak\"; exit 0"
    }
  ]
}
```

Trigger: `PreCompact`. **Neither agent- nor user-facing:** `PreCompact` supports no `additionalContext`, and its stdout only reaches the debug log -- so the snippet writes a side-file instead of printing. The reliable path back into context after a compaction is the SessionStart reminder plus re-reading `SCRATCHPAD.md`. Gitignore the `.bak`.

### SessionStart -- unattended-session banner

```json
{
  "matcher": "startup|resume",
  "hooks": [
    {
      "type": "command",
      "command": "if [ \"$CLAUDE_CODE_REMOTE\" = \"true\" ]; then echo 'Unattended session (CLAUDE_CODE_REMOTE=true) -- no human will answer a question. CLAUDE.md > Autonomy applies to this run.'; fi; exit 0"
    }
  ]
}
```

Trigger: `SessionStart`. Agent-facing via plain stdout -- one of the three events where that works, so no JSON wrapper is needed. Fires only in web/cloud sessions, routine runs included; in the local CLI the variable is unset and the hook prints nothing. This is the autonomy rule arriving as context instead of hoping the model re-read CLAUDE.md.

### Stop -- review reminder

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "printf '%s' '{\"systemMessage\":\"Session ending -- if code changed this session, the review process per agent_docs/review_process.md must have run before commit.\"}'"
    }
  ]
}
```

Trigger: `Stop`. User-facing (same reasoning as the cleanup reminder above).

### Block push to main on red

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "cmd=$(jq -r '.tool_input.command // empty'); if echo \"$cmd\" | grep -q 'git push'; then ref=$(echo \"$cmd\" | grep -oE '\\b(main|master|develop|trunk)\\b' | head -1); [ -n \"$ref\" ] || ref=$(git -C \"$CLAUDE_PROJECT_DIR\" rev-parse --abbrev-ref HEAD 2>/dev/null); case \"$ref\" in main|master|develop|trunk) cd \"$CLAUDE_PROJECT_DIR\" && { npx tsc --noEmit && npm test; } || { echo 'BLOCKED: typecheck/tests failing -- never push to main on red.' >&2; exit 2; };; esac; fi"
    }
  ]
}
```

Trigger: `PreToolUse`. Project commands inserted from CLAUDE.md (lint is `npm run lint`, typecheck is `npx tsc --noEmit`, tests are vitest via `npm test`). Requires `jq` -- without it the guard never fires (see Notes). Heuristic and **err-safe**: a bare `git push` is resolved via the currently checked-out branch, and a false positive merely runs the checks -- it only blocks when they are red.

### Block force-push without confirmation

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "cmd=$(jq -r '.tool_input.command // empty'); if echo \"$cmd\" | grep -qE 'git push.*(--force(-with-lease)?|-f)\\b'; then echo 'BLOCKED: force-push requires explicit user confirmation. Re-run after user approves.' >&2; exit 2; fi"
    }
  ]
}
```

Trigger: `PreToolUse`. Catches `--force`, `--force-with-lease`, and the short `-f` flag (combined short flags like `-uf` are not detected). Requires `jq` -- without it the guard never fires (see Notes).

### Mermaid validate on save

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "fp=$(jq -r '.tool_input.file_path // empty'); if echo \"$fp\" | grep -q '\\.mmd$'; then cd \"$CLAUDE_PROJECT_DIR\" || exit 0; out=$(npx -y -p @mermaid-js/mermaid-cli mmdc -i docs/ARCHITECTURE.mmd -o docs/ARCHITECTURE.svg 2>&1) || jq -nc --arg m \"Mermaid render failed -- fix per diagram_prompt.md syntax rules: $(printf '%s' \"$out\" | tail -5)\" '{hookSpecificOutput:{hookEventName:\"PostToolUse\",additionalContext:$m}}'; fi; exit 0"
    }
  ]
}
```

Trigger: `PostToolUse`

### Doc-update reminder after src/ edit

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "fp=$(jq -r '.tool_input.file_path // empty'); if echo \"$fp\" | grep -qE '(^|/)(src|lib|app)/'; then printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"Source changed -- check whether CLAUDE.md / README.md / MEMORY.md need updates per Documentation Rules.\"}}'; fi; exit 0"
    }
  ]
}
```

Trigger: `PostToolUse`

---

## Tier 3 -- Optional

### GitNexus pre-edit impact reminder (read-only)

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "fp=$(jq -r '.tool_input.file_path // empty'); if echo \"$fp\" | grep -qE '\\.(ts|tsx|js|jsx|py|rs|go|java|kt|cs|rb|php)$'; then printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"Pre-edit: run gitnexus_impact({target, direction: \\\"upstream\\\"}) before modifying symbols.\"}}'; fi; exit 0"
    }
  ]
}
```

Trigger: `PreToolUse`. Read-only reminder only -- GitNexus must never write tracked files (see the Read-Only Analysis Policy in CLAUDE.md).

### GitNexus pre-commit scope check (read-only)

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "cmd=$(jq -r '.tool_input.command // empty'); if echo \"$cmd\" | grep -qE 'git commit'; then printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"Pre-commit: run gitnexus_detect_changes() to verify scope before this commit.\"}}'; fi; exit 0"
    }
  ]
}
```

Trigger: `PreToolUse`. Complements the Tier-1 staged-file guard already active in `.claude/settings.json`.

### Conventional Commits format check

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "cmd=$(jq -r '.tool_input.command // empty'); msg=$(echo \"$cmd\" | grep -oE 'git commit.*-m *\"[^\"]+\"' | head -1); if [ -n \"$msg\" ] && ! echo \"$msg\" | grep -qE '\"(feat|fix|docs|style|refactor|perf|test|chore|build|ci)(\\([^)]+\\))?(!)?:'; then printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"additionalContext\":\"Commit message does not follow Conventional Commits -- rewrite as type(scope): description before retrying.\"}}'; fi; exit 0"
    }
  ]
}
```

Trigger: `PreToolUse`. Agent-facing, non-blocking -- the agent sees the message next to the tool result and can correct the message itself.

### Done-skill auto-trigger on "done"/"fertig"

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "p=$(jq -r '.prompt // empty'); if echo \"$p\" | grep -qiE '^(done|fertig|finished|abschluss|/done) *$'; then echo 'Trigger: load .claude/skills/done/SKILL.md and follow the closure workflow.'; fi"
    }
  ]
}
```

Trigger: `UserPromptSubmit`. One of the three events where bare stdout _is_ added to the agent's context -- no JSON needed here.

### Dependency-install warning

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "cmd=$(jq -r '.tool_input.command // empty'); if echo \"$cmd\" | grep -qE '(npm|yarn|pnpm|bun) (install|add) |pip install [a-zA-Z]|cargo add |go get |gem install |composer require '; then printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"ask\",\"permissionDecisionReason\":\"New dependency -- confirm with the user per the Dependency Management rule in CLAUDE.md.\"}}'; fi; exit 0"
    }
  ]
}
```

Trigger: `PreToolUse`. Forces the permission prompt instead of only mentioning the rule, so the install cannot slip through unconfirmed.

---

## Notes

- **Hook input arrives as a JSON payload on stdin**, not via environment variables. Relevant fields: `.tool_input.command` (Bash tool), `.tool_input.file_path` (Edit/Write), `.prompt` (UserPromptSubmit). The snippets parse stdin with `jq` -- there are no `$CLAUDE_TOOL_INPUT` / `$CLAUDE_USER_PROMPT` env vars.
- `$CLAUDE_PROJECT_DIR` IS a real environment variable (absolute project root), usable in any hook command; `${CLAUDE_PROJECT_DIR}` is also substituted inside `command`. `$CLAUDE_CODE_REMOTE` (`"true"` in web/cloud sessions, unset locally) and `$CLAUDE_EFFORT` are available the same way.
- **`jq` is required** for every snippet that reads stdin. Without `jq` the hook errors out and does NOT block -- for reminder hooks that's harmless, but the two BLOCK hooks then provide no protection. Verify `jq` is installed wherever you rely on them. The Tier-1 quality-config guard in `.claude/settings.json` is the one that tests for `jq` itself and reports when it cannot run; copy that leading test into any snippet here whose silence would be mistaken for protection.
- **Exit-0 stdout reaches the agent only on `SessionStart` / `UserPromptSubmit` / `UserPromptExpansion`.** Everywhere else it lands in the debug log -- see _Reaching the agent_ above for the `additionalContext` / `permissionDecision` / `systemMessage` alternatives. An `echo 'WARNING...'` on `PreToolUse` or `PostToolUse` is a no-op.
- Exit code `2` from a `PreToolUse` hook blocks the tool call and feeds **stderr** back to Claude -- block messages must go to stderr (`>&2`). On `PostToolUse` the tool already ran, so exit 2 cannot block; stderr is still shown to Claude. Other non-zero exits print stderr but don't block.
- Hooks run in the user's shell. Quote paths, escape `$` carefully when copying.
- After modifying `.claude/settings.json`, restart the Claude Code session (or review via `/hooks`) for changes to take effect.

<!-- Generated by claude-code-optimizer v1.37.0 -->
