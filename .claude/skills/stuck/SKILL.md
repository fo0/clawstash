---
name: stuck
description: "Use when the agent is in a fix-retry loop, an error keeps recurring after multiple attempts, or the user says 'stuck', 'loop', 'going in circles', '/stuck'. Snapshot what was tried, surface to user, never silent-retry past 3 attempts."
---

# Stuck — Loop / Dead-End Recovery

## When to Use

- User says "stuck", "loop", "going in circles", "/stuck"
- Agent self-detects a loop:
  - Same error after 2nd fix attempt -> log warning, third attempt MAY proceed if a different angle is being tried
  - Same error after 3rd attempt -> STOP, invoke this skill
  - Same file edited 5+ times in one session for the same defect
- A test passes locally but fails in CI 2+ consecutive runs without a code change in between (likely flake — see CI-skill rules)

## Workflow

### 1. Snapshot

Capture exact current state:

```bash
git status --porcelain
git diff --stat
git log --oneline -10
```

Plus:
- Last error message verbatim (no paraphrasing)
- Last 3 commands run and their exit codes
- Files touched in this loop

### 2. Attempt Log

Build an explicit list of what's been tried this session:

```
Attempt 1: <approach> -> <result>
Attempt 2: <approach> -> <result>
Attempt 3: <approach> -> <result>
```

If you can't articulate the attempts as distinct approaches -> that itself is the diagnosis (you've been trying the same thing).

### 3. Diagnose Loop Type

| Pattern                                                           | Likely cause                                  | Action                                |
|-------------------------------------------------------------------|-----------------------------------------------|---------------------------------------|
| Same fix re-applied because tests still fail                      | Test is wrong, not the code                   | Question the test                     |
| Lint passes locally, fails in CI                                  | Tooling-version drift                         | Pin versions, check `.tool-versions` / lockfile |
| Import / module-not-found that "should work"                      | Cache, build artifacts, stale lockfile        | Clean caches, re-install deps         |
| Type error surviving every cast                                   | Wrong type model, not wrong cast              | Step back, redesign types             |
| Test flake (passes/fails non-deterministically)                   | Async race / shared state / clock dependency  | Treat as flake -> BACKLOG.md           |
| Network / external-API error                                      | Unmocked external dep                         | Apply autonomy + zero-cost rule -- mock |
| Build infra (timeout / OOM / runner)                              | NOT a code defect                             | Surface to CI skill, do not "fix" code |

### 4. Surface to User

Strict format:

```
Stuck -- escalating after <N> attempts on the same defect.

Snapshot:
- Branch: <branch>
- Last error: <verbatim, fenced>
- Files touched repeatedly: <list>

Attempts:
1. <approach> -> <result>
2. <approach> -> <result>
3. <approach> -> <result>

Diagnosis: <loop type from table above, OR "unknown -- pattern doesn't match">

Options for the user:
A) <concrete next-step option>
B) <alternative angle>
C) revert the loop work -- `/rollback`
D) defer to BACKLOG and move on

What would you like?
```

Then **stop**. Do NOT take a 4th attempt without user input.

## Hard Rules

- **3-attempt cap on the same defect.** No exceptions. The 4th try without user input is forbidden.
- **Snapshot before escalating.** No vague "I'm stuck" -- show evidence.
- **Verbatim error messages.** Never paraphrase the error when escalating.
- **No silent retries.** If you've tried X and it didn't work, say so.
- **Loop work doesn't get committed silently.** Either user picks a path or rollback the loop.

## After User Response

- User picks a concrete option -> execute, with attempt counter reset for the *new* approach (not for the underlying defect).
- User asks for more info -> produce the requested data, do NOT take it as license to retry.
- User says "keep trying" -> ask once: "Same approach or a new angle? If same, I will stop after one more attempt." Then enforce that.
