# Hooks Catalog -- Tier-2/3

Ready-to-paste hook snippets that enforce optimizer rules beyond the Tier-1 minimum in `.claude/settings.json`. Copy what fits, paste into `.claude/settings.json` under the matching trigger.

> **Tier-1 hooks** (already in `.claude/settings.json`): GitNexus read-only pre-commit guard (no auto-analyze), CLAUDE.md size guard, SessionStart memory reminder.
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

Each snippet below states its **Trigger** and, where it matters, whether it is agent-facing or user-facing.

---

## Tier 2 -- Recommended

### MEMORY.md size warning (>16,000 chars)

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "f=\"$CLAUDE_PROJECT_DIR/MEMORY.md\"; if [ -f \"$f\" ] && [ \"$(wc -c < \"$f\")\" -gt 16000 ]; then printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"MEMORY.md exceeds 16000 chars -- remove obsolete entries per memory_process.md.\"}}'; fi; exit 0"
    }
  ]
}
```

Trigger: `PostToolUse`

### SCRATCHPAD.md size warning (>8,000 chars)

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "f=\"$CLAUDE_PROJECT_DIR/SCRATCHPAD.md\"; if [ -f \"$f\" ] && [ \"$(wc -c < \"$f\")\" -gt 8000 ]; then printf '%s' '{\"hookSpecificOutput\":{\"hookEventName\":\"PostToolUse\",\"additionalContext\":\"SCRATCHPAD.md exceeds 8000 chars -- clean resolved entries; promote long-lived ones to MEMORY.md.\"}}'; fi; exit 0"
    }
  ]
}
```

Trigger: `PostToolUse`

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

Trigger: `PreToolUse`. Project commands inserted from CLAUDE.md (no ESLint configured yet; typecheck is `npx tsc --noEmit`, tests are vitest via `npm test`). Requires `jq` -- without it the guard never fires (see Notes). Heuristic and **err-safe**: a bare `git push` is resolved via the currently checked-out branch, and a false positive merely runs the checks -- it only blocks when they are red.

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
- `$CLAUDE_PROJECT_DIR` IS a real environment variable (absolute project root), usable in any hook command.
- **`jq` is required** for every snippet that reads stdin. Without `jq` the hook errors out and does NOT block -- for reminder hooks that's harmless, but the two BLOCK hooks then provide no protection. Verify `jq` is installed wherever you rely on them.
- **Exit-0 stdout reaches the agent only on `SessionStart` / `UserPromptSubmit` / `UserPromptExpansion`.** Everywhere else it lands in the debug log -- see _Reaching the agent_ above for the `additionalContext` / `permissionDecision` / `systemMessage` alternatives. An `echo 'WARNING...'` on `PreToolUse` or `PostToolUse` is a no-op.
- Exit code `2` from a `PreToolUse` hook blocks the tool call and feeds **stderr** back to Claude -- block messages must go to stderr (`>&2`). On `PostToolUse` the tool already ran, so exit 2 cannot block; stderr is still shown to Claude. Other non-zero exits print stderr but don't block.
- Hooks run in the user's shell. Quote paths, escape `$` carefully when copying.
- After modifying `.claude/settings.json`, restart the Claude Code session (or review via `/hooks`) for changes to take effect.
