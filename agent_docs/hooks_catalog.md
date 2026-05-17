# Hooks Catalog -- Tier-2/3

Ready-to-paste hook snippets that enforce optimizer rules beyond the Tier-1 minimum in `.claude/settings.json`. Copy what fits, paste into `.claude/settings.json` under the matching trigger.

> **Tier-1 hooks** (already in `.claude/settings.json`): GitNexus analyze on commit/merge, CLAUDE.md size guard, SessionStart memory reminder.
> **Tier-2** = recommended, default off -- copy if relevant.
> **Tier-3** = optional, situational -- copy only if you actively want the behavior.

## How to use
1. Open `.claude/settings.json`.
2. Find the matching trigger (`PostToolUse`, `PreToolUse`, `Stop`, `PreCompact`, `UserPromptSubmit`).
3. Append the snippet's hook entry to the trigger's array. Don't duplicate matchers -- merge into existing matcher's `hooks` list.

---

## Tier 2 -- Recommended

### MEMORY.md size warning (>16,000 chars)

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "f=\"$CLAUDE_PROJECT_DIR/MEMORY.md\"; [ -f \"$f\" ] && [ $(wc -c < \"$f\") -gt 16000 ] && echo 'MEMORY.md > 16000 chars -- remove obsolete entries per memory_process.md.' || true"
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
      "command": "f=\"$CLAUDE_PROJECT_DIR/SCRATCHPAD.md\"; [ -f \"$f\" ] && [ $(wc -c < \"$f\") -gt 8000 ] && echo 'SCRATCHPAD.md > 8000 chars -- clean resolved entries; promote long-lived ones to MEMORY.md.' || true"
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
      "command": "echo 'Session ending -- verify SCRATCHPAD.md is clean. Promote stable entries to MEMORY.md per memory_process.md.'"
    }
  ]
}
```
Trigger: `Stop`

### PreCompact -- dump scratchpad state

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "f=\"$CLAUDE_PROJECT_DIR/SCRATCHPAD.md\"; [ -f \"$f\" ] && echo '=== SCRATCHPAD before compact ===' && cat \"$f\" || true"
    }
  ]
}
```
Trigger: `PreCompact`

### Stop -- review reminder

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "echo 'Session ending -- if code changed this session, review process per agent_docs/review_process.md must have run before commit.'"
    }
  ]
}
```
Trigger: `Stop`

### Block push to main on red

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE 'git push.*\\b(main|master|develop|trunk)\\b'; then cd \"$CLAUDE_PROJECT_DIR\" && { npx tsc --noEmit && npm run build; } || { echo 'BLOCKED: typecheck/build failing -- never push to main on red.'; exit 2; }; fi"
    }
  ]
}
```
Trigger: `PreToolUse`. Project commands inserted from CLAUDE.md (no linter configured yet; test framework is vitest -- `npm test`).

### Block force-push without confirmation

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE 'git push.*--force(-with-lease)?\\b'; then echo 'BLOCKED: force-push requires explicit user confirmation. Re-run after user approves.'; exit 2; fi"
    }
  ]
}
```
Trigger: `PreToolUse`

### Mermaid validate on save

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -q '\\.mmd'; then cd \"$CLAUDE_PROJECT_DIR\" && npx -y @mermaid-js/mermaid-cli mmdc -i docs/ARCHITECTURE.mmd -o docs/ARCHITECTURE.svg 2>&1 | tail -5 || echo 'Mermaid syntax error -- check diagram_prompt.md syntax rules.'; fi"
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
      "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE 'src/|lib/|app/'; then echo 'Source changed -- verify CLAUDE.md / README.md / MEMORY.md need updates per Documentation Rules.'; fi"
    }
  ]
}
```
Trigger: `PostToolUse`

---

## Tier 3 -- Optional

### GitNexus pre-edit impact reminder

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE '\\.(ts|tsx|js|jsx|py|rs|go|java|kt|cs|rb|php)$'; then echo 'Pre-edit: run gitnexus_impact({target, direction: \"upstream\"}) before modifying symbols.'; fi"
    }
  ]
}
```
Trigger: `PreToolUse`

### GitNexus pre-commit scope check

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE 'git commit'; then echo 'Pre-commit: run gitnexus_detect_changes() to verify scope before this commit.'; fi"
    }
  ]
}
```
Trigger: `PreToolUse`

### Conventional Commits format check

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "msg=$(echo \"$CLAUDE_TOOL_INPUT\" | grep -oE 'git commit.*-m *\"[^\"]+\"' | head -1); if [ -n \"$msg\" ] && ! echo \"$msg\" | grep -qE '\"(feat|fix|docs|style|refactor|perf|test|chore|build|ci)(\\([^)]+\\))?(!)?:'; then echo 'WARNING: commit message does not follow Conventional Commits.'; fi"
    }
  ]
}
```
Trigger: `PreToolUse`

### Done-skill auto-trigger on "done"/"fertig"

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "if echo \"$CLAUDE_USER_PROMPT\" | grep -qiE '^(done|fertig|finished|abschluss|/done) *$'; then echo 'Trigger: load .claude/skills/done/SKILL.md and follow the closure workflow.'; fi"
    }
  ]
}
```
Trigger: `UserPromptSubmit`

### Dependency-install warning

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "command": "if echo \"$CLAUDE_TOOL_INPUT\" | grep -qE '(npm|yarn|pnpm|bun) (install|add) |pip install [a-zA-Z]|cargo add |go get |gem install |composer require '; then echo 'New dependency requested -- confirm with user per Dependency Management rule in CLAUDE.md.'; fi"
    }
  ]
}
```
Trigger: `PreToolUse`

---

## Notes
- `$CLAUDE_PROJECT_DIR`, `$CLAUDE_TOOL_INPUT`, `$CLAUDE_USER_PROMPT` are environment variables Claude Code sets per hook event. If a snippet relies on a variable not yet exposed in your version, the hook silently no-ops -- no harm.
- Exit code `2` from a `PreToolUse` hook blocks the tool call. Other non-zero exits print stderr but don't block.
- Hooks run in the user's shell. Quote paths, escape `$` carefully when copying.
- After modifying `.claude/settings.json`, restart the Claude Code session for changes to take effect.
