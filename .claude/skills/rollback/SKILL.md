---
name: rollback
description: "Use when the user wants to undo a broken commit, push, or PR — triggered by /rollback, 'rollback', 'revert that', 'undo last commit', 'undo the push', 'restore branch'. Auto-detects the rollback target from current state (last commit / pushed range / open PR / merged PR) and chooses the safest reversal path. Never destroys history without explicit confirmation."
---

# Rollback — Recovery Workflow

## When to Use

- User says "/rollback", "rollback", "revert", "undo", "restore"
- Agent broke main / merged a bad PR / pushed a defect / corrupted a branch

## Auto-Detect Target

```bash
git rev-parse --abbrev-ref HEAD
git status --porcelain
git log -1 --pretty='%H %s'
git log @{u}..HEAD --oneline 2>/dev/null  # local-only commits
git log HEAD..@{u} --oneline 2>/dev/null  # behind upstream
gh pr list --head $(git rev-parse --abbrev-ref HEAD) --json number,state 2>/dev/null
```

Decision matrix:

| State                                   | Action                                  |
|-----------------------------------------|------------------------------------------|
| Uncommitted local changes only          | Phase A (discard working tree, opt-in)   |
| Local commits, not pushed               | Phase B (reset back N commits)           |
| Pushed commits on feature branch        | Phase C (revert + push, or force-with-lease — explicit) |
| Pushed to main + bad commit on top      | Phase D (revert + push)                  |
| Merged PR causing breakage              | Phase E (revert PR via gh)               |
| Branch deleted by mistake               | Phase F (restore from reflog / origin)   |

Always **print the detected state and proposed action before executing**:
```
Detected: pushed 2 commits to feature/x; latest broke build.
Proposed: git revert HEAD~1..HEAD && git push (no force).
Proceed? (yes/no)
```

## Phase A — Discard uncommitted changes

User must explicitly confirm. Loses local work.

```bash
git diff --stat            # show what will be lost
# Wait for user "yes"
git restore --staged .
git restore .
```

## Phase B — Reset local-only commits

```bash
git log @{u}..HEAD --oneline    # confirm range
# Wait for user "yes"
git reset --hard HEAD~N         # N = number of unpushed commits
```

## Phase C — Revert pushed commits on feature branch

Default: revert (preserves history). Force-push only on explicit user request.

```bash
git revert --no-edit HEAD~N..HEAD
git push                                  # no force
# OR (only if user explicitly says "force" or "rewrite history"):
# git push --force-with-lease
```

## Phase D — Revert on main

Always use `git revert` on main. Never `git reset --hard` on main without explicit user override.

```bash
git revert --no-edit <bad-sha>
git push origin main
```

If revert produces a conflict -> stop, ask user to resolve manually.

## Phase E — Revert merged PR

```bash
PR=<number>
gh pr view "$PR" --json mergeCommit,baseRefName,headRefName
# Open a revert PR
gh pr revert "$PR"   # if available; otherwise:
git checkout main && git pull
git revert -m 1 <merge-commit-sha>
git push origin main
gh pr comment "$PR" --body "Reverted via #<new-pr-number> -- <reason>"
```

## Phase F — Restore deleted branch

```bash
git reflog | head -20                    # find the lost SHA
git branch <name> <sha>                  # local restore
git push -u origin <name>                # if remote was also gone
# Alternative if branch still on remote: git fetch && git checkout <name>
```

## Hard Rules

- **Never `git reset --hard` on main.** Always revert.
- **Never `git push --force` on main.** Default is revert + new commit.
- **Never delete a branch** as part of rollback — only restore / revert.
- **Always print a dry-run diff** of what the rollback will change before executing.
- **Always confirm with the user before destructive ops** (`reset --hard`, `force-push`, branch delete).
- **Test must pass after rollback.** If the rollback itself breaks the build, stop and surface.

## After Rollback

1. Run lint / typecheck / test / build per CLAUDE.md.
2. If GitNexus is enabled: `gitnexus_detect_changes()` to confirm scope.
3. Comment on the original PR / issue explaining the rollback (English, short).
4. Recommend a follow-up: open a new branch, fix the root cause, do not just re-apply.

## Report

```
Rollback complete
Phase: <A/B/C/D/E/F>
Reverted: <commits or PR number>
Branch: <branch>
Tests: <pass/fail>
Next: <link to follow-up branch or issue, if applicable>
```

If failed:

```
Rollback halted
Reason: <conflict / test failure / missing reflog entry>
State: <what's currently true on disk + remote>
Next steps: <concrete commands the user can run>
```
