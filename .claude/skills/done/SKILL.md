---
name: done
description: "Use when the user signals work completion with 'done', 'fertig', 'finished', 'abschluss', '/done'. Detects current branch (main vs feature), runs closure checks defined in CLAUDE.md, handles commit and push based on branch context, closes related GitHub issues, and reports a strict short summary."
metadata:
  origin: claude-code-optimizer
---

# Done — Work Closure

## When to Use

- User says "done", "fertig", "finished", "abschluss", "/done"
- End of a feature, bugfix, or task when ready to wrap up

## Scope Boundaries

**Owns:** closing a piece of work out -- format, the automated-check chain, scope check, commit, push, issue close.
**Does not own:** the review itself (`review`), the PR object (`pr`), remote build state (`ci`). It _suggests_ those and never runs them -- that fence is what keeps `/done` predictable enough to type without reading it first.

## Workflow

### 1. Detect branch context

```bash
git rev-parse --abbrev-ref HEAD && git status --porcelain && git log origin/$(git rev-parse --abbrev-ref HEAD)..HEAD --oneline 2>/dev/null || echo "no upstream"
```

Classify:

- `main` / `master` / `develop` / `trunk` -> **main branch mode** (conservative)
- anything else -> **feature branch mode** (standard)

### 2. Read CLAUDE.md closure requirements

- **Commands section** -> identify format / lint / typecheck / test / build commands
- **Git Conventions** -> commit format (Conventional Commits), branch rules, merge strategy
- **Documentation Rules** -> verify affected docs (CLAUDE.md, README.md, MEMORY.md, SCRATCHPAD.md, BACKLOG.md) are up to date

### 3. Auto-format (write mode)

Run the project's format-write command from CLAUDE.md Commands block (`npm run format` -> `prettier --write .`). This MUST run before lint/typecheck/test/build -- formatting drift introduced during the session otherwise reaches CI and fails `format:check`.

- If no format-write command is listed in CLAUDE.md, skip this step (project has no formatter configured).
- If formatting changed files, **stage them with `git add -u` so they go into the upcoming commit (step 6)** -- do NOT split formatting into its own commit.
- Re-run `git status --porcelain` after formatting to see what changed.

### 4. Run automated checks

Execute the project's lint/typecheck/test/build commands from CLAUDE.md. If any fail:

- **Feature branch:** report failure, stop. Do not commit.
- **Main branch:** hard stop. Never push to main on red.

### 5. Verify scope + GitNexus read-only guard

If GitNexus is available, confirm the change scope (read-only):

```
gitnexus_detect_changes({scope: "all"})
```

Surface any unexpected affected processes. Then run `git status` and verify no unexpected `.claude/**`, `CLAUDE.md`, `AGENTS.md`, or `agent_docs/**` changes are staged -- if GitNexus (or anything else) touched them and they weren't the point of the task, revert with `git checkout -- <paths>` before committing.

### 5b. Context budget check

```bash
wc -c CLAUDE.md MEMORY.md SCRATCHPAD.md 2>/dev/null
```

Over 20,000 / 16,000 / 8,000 chars -> offload per `agent_docs/context_budget.md` **now**, in this commit: move content to `agent_docs/` (or `docs/adr/`, `agent_docs/memory_archive/`) and leave a one-line pointer. Never delete to fit. This is the closure gate that keeps the always-loaded files from drifting -- deferring it just moves the cost to every future session.

### 6. Commit uncommitted changes (if any)

- Follow project's commit message convention (Conventional Commits if defined)
- Reference GitHub issue number if applicable (e.g. `feat: add X (#42)`)
- **Main branch:** if uncommitted diff is large/unfocused -> ask user before committing. Unattended (`$CLAUDE_CODE_REMOTE=true`) nobody answers: leave it uncommitted, report the `git diff --stat` as the open point, and finish the steps that do not depend on it (CLAUDE.md -> _Autonomy_).

### 7. Push

- **Feature branch:** `git push` (use `git push -u origin <branch>` on first push). **Project rule (clawstash): do NOT push unless the user explicitly asks.**
- **Main branch:** `git push origin <branch>` only after all checks green AND explicit user request.
- **Never force-push** unless user explicitly requests.

### 8. Suggest PR + CI (feature branch only)

After push on a feature branch, suggest follow-ups — do NOT run them automatically:

- Print: `Run /pr to handle the PR (auto-detects: create / update / status).`
- Print: `Run /ci to check the build (auto-detects: status / logs / fix).`
- The PR skill (`.claude/skills/pr/SKILL.md`) and CI skill (`.claude/skills/ci/SKILL.md`) auto-route by state. Done-skill never invokes them directly.

### 9. Close related GitHub issue (if applicable)

- Comment on the issue in **English** with a short summary of what was delivered
- Close the issue

### 10. Report

Strict format, strict limits:

```
[OK] {branch}: {what was done -- max 3 lines}

-> Next: {max 2 lines, only if something is open; omit entirely if nothing pending}
```

## Rules

- **Format-write always runs before lint** -- never commit unformatted files. CI's `format:check` is unforgiving.
- **Pre-commit guard is a backstop, not a substitute.** If `agent_docs/ci_formatting_guard.md` (husky + lint-staged) is set up, commits auto-format staged files even outside this skill -- but still run format-write here so the diff you review matches what gets committed, and never bypass the hook with `--no-verify`.
- **Never push to `main` with failing checks.** Hard stop.
- **Never force-push** without explicit user request.
- **Ambiguous state on main** (large uncommitted diff, unclear scope) -> ask first; unattended -> uncommitted plus a report line (step 6).
- **Report line limits are hard.** 3 lines for summary, 2 lines for next. No preamble, no postamble.
- If nothing to commit AND nothing to push AND no open issue -> single-line confirmation: `[OK] {branch}: already clean, nothing to do.`
