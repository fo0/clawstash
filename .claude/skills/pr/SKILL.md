---
name: pr
description: "Use for any GitHub Pull Request work. Auto-detects lifecycle phase (create / update / report) from current state — only requires explicit command for status, comments, or merge. Triggered by /pr, 'PR', 'create PR', 'open PR', 'update PR', 'PR status', 'merge PR'. Suggests, never auto-creates without user invocation."
---

# PR — Pull Request Workflow

## When to Use

- User says "PR" / "/pr" / "create PR" / "open PR" / "update PR" -> **auto-route by state**
- User says "PR status" / "/pr status" / "check PR" -> status (override)
- User says "PR comments" / "/pr comments" -> read review comments (override)
- User says "merge PR" / "/pr merge" -> merge (explicit only, never automatic)
- After done-skill push step on a feature branch -> suggested, user invokes `/pr` to trigger

## Prerequisites

```bash
gh auth status && gh repo view --json name,owner
```

If `gh` is missing or unauthenticated:
- Print: `gh CLI required. Install: https://cli.github.com — then run: gh auth login`
- Stop. Do NOT fall back to manual PR creation via web.

## Dependency-Bot PRs (auto-detect)

Before normal auto-routing, detect dep-bot PRs by **head branch pattern** (not by author — author can be spoofed):

| Bot          | Branch pattern               |
|--------------|------------------------------|
| Dependabot   | `dependabot/**`              |
| Renovate     | `renovate/**` or `renovate-bot/**` |
| Snyk         | `snyk-fix/**` / `snyk-upgrade/**` |
| pyup         | `pyup-update-**`             |

When a dep-bot PR is detected (i.e. checking out, viewing, or working with a branch matching one of these patterns), follow the **Dep-Bot PR Workflow** below instead of standard `/pr` routing.

### Dep-Bot PR Workflow

1. **Identify scope** — `gh pr view --json title,body,files` — what packages and from which versions to which.
2. **Read changelog/release notes** for each upgraded package — `gh pr view` body usually includes them. For major version bumps, fetch the upstream changelog.
3. **Run the project's full check suite locally** on the dep-bot branch (lint / typecheck / test / build per CLAUDE.md).
4. **Classify by bump type:**
   - **Patch** — auto-approve workflow: tests green -> recommend merge.
   - **Minor** — review for behavior changes; tests green + changelog clean -> recommend merge.
   - **Major** — never auto-recommend merge. Read full migration guide. Surface breaking changes to user with explicit list.
5. **Security advisories** in PR body -> treat as P0 from the security-review skill — fix-forward even on rough merges.
6. **Group strategy** — if multiple dep-bot PRs are open, ask user whether to batch-merge ordered by ecosystem; never silently rebase across bots.
7. **Never auto-merge** dep-bot PRs without explicit user command (same rule as `/pr merge`).

Report:
```
Dep-bot PR detected (<bot>): <N> packages bumped
Bumps: <package@from->to, ...>
Bump type: patch | minor | major
Local checks: <pass/fail>
Changelog risks: <none / list>
Recommendation: <merge / hold / surface for review>
```

After Dep-Bot Workflow finishes, fall through to standard routing only on explicit user command.

## Auto-Routing (default `/pr`)

When the user invokes `/pr` or "PR" without a sub-command, **detect the lifecycle phase from current state** and act:

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
PR_JSON=$(gh pr list --head "$BRANCH" --json number,state,url,headRefOid 2>/dev/null)
HEAD_SHA=$(git rev-parse HEAD)
```

Decision matrix:

| State | Action |
|-------|--------|
| Branch is `main`/`master`/`develop`/`trunk` | Stop: `On main branch — no PR needed.` |
| No PR exists for branch | -> **create** (see Phase A) |
| PR exists, `headRefOid != HEAD_SHA` (local ahead of PR) | -> **push + update body** (see Phase B) |
| PR exists, `headRefOid == HEAD_SHA`, body summary stale vs commits | -> **update body only** (see Phase B) |
| PR exists, fully synced | -> **status** (see Phase C, read-only report) |
| PR exists but in `MERGED`/`CLOSED` state | Report final state + URL, stop |

Always print the detected phase before acting: `Detected: no PR exists -> creating.` / `Detected: PR #42 behind local -> pushing and updating.` / `Detected: PR #42 in sync -> showing status.`

## Phase A — Create

1. **Push if needed:** if branch has no upstream -> `git push -u origin <branch>`.
2. **Title:** derived from branch name OR latest commit subject (see *Branch-name -> title heuristics* below). Keep <=70 chars.
3. **Body:** generated from commits between base and HEAD:

   ```bash
   BASE=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)
   git log "origin/$BASE..HEAD" --oneline
   ```

   Format:
   ```markdown
   ## Summary
   - <1-3 bullet points from commit subjects, deduplicated>

   ## Test plan
   - [ ] <what the user/reviewer needs to verify>

   Generated with [Claude Code](https://claude.com/claude-code)
   ```
4. **Create:** `gh pr create --title "..." --body "$(cat <<'EOF' ... EOF)"`. Use HEREDOC for body.
5. **Report URL** from gh output.

## Phase B — Update

1. `gh pr view --json number,url,body,state,baseRefName` — load existing PR.
2. **Push first** if local is ahead: `git push` (no force unless user explicitly requested).
3. Re-derive Summary from commits since base:
   ```bash
   git log "origin/$BASE..HEAD" --oneline
   ```
4. **Preserve user-edited sections:** if PR body contains text outside `## Summary` and `## Test plan` blocks (screenshots, manual notes), keep them untouched. Only update Summary bullets and Test plan if it's still empty.
5. `gh pr edit <number> --body "$(cat <<'EOF' ... EOF)"`
6. Report: `Updated PR #N: <url>`

## Phase C — Status (default for synced PRs, or explicit `/pr status`)

```bash
gh pr view --json number,state,statusCheckRollup,reviewDecision,mergeable,url
gh pr checks
```

Report compact:
```
PR #N: <state> | CI: <pass/fail/pending> | Review: <approved/changes_requested/pending> | Mergeable: <yes/no/conflict>
URL: <url>
Failing checks: <list, only if any>
```

## `/pr comments` — read review comments (explicit override)

```bash
gh api "repos/{owner}/{repo}/pulls/{n}/comments" --jq '.[] | {user: .user.login, path, line, body}'
gh api "repos/{owner}/{repo}/issues/{n}/comments"  --jq '.[] | {user: .user.login, body}'
```

Group by reviewer + file. Show unresolved comments first. Do NOT auto-fix — surface findings, let user decide.

## `/pr merge` — merge (explicit only, never auto-routed)

**Never run without explicit user command.** Even if CI is green and approvals exist. Default `/pr` never reaches this phase.

Pre-flight:
1. `gh pr view --json state,statusCheckRollup,reviewDecision,mergeable` — verify mergeable.
2. CI must be green. If not -> stop: `Cannot merge: CI failing.`
3. If `reviewDecision != APPROVED` and repo requires approval -> stop: `Cannot merge: review approval required.`
4. Merge strategy: read from CLAUDE.md "Git Conventions -> Merge Strategy". Default `--squash` if undefined.

```bash
gh pr merge <number> --squash --delete-branch
```

Report: `Merged PR #N (<strategy>). Branch deleted.`

## Rules

- **Auto-route only on default `/pr`.** Explicit sub-commands (`status`, `comments`, `merge`) always override detection.
- **Print detected phase before acting** so user can interrupt if wrong.
- **Never force-push** to update PR — use `gh pr edit` for body, `git push` (no force) for code unless user explicitly requests force-with-lease.
- **Never merge automatically.** Explicit `/pr merge` required.
- **Issue linking:** if commit messages contain `#<n>` references -> include `Closes #<n>` in PR body Summary section.
- **Draft PRs:** if user says "draft PR" -> use `gh pr create --draft`.
- **Branch-name -> title heuristics:**
  - `feat/X` or `feature/X` -> `feat: X`
  - `fix/X` or `bugfix/X` -> `fix: X`
  - `refactor/X` -> `refactor: X`
  - `docs/X` -> `docs: X`
  - Generic name (`dev`, `tmp`, `wip/X`) -> use latest commit subject.
- **Conventional Commits compliance:** if CLAUDE.md defines Conventional Commits, PR title must match the format.

## Error Recovery

| Failure | Action |
|---------|--------|
| `gh` not installed | Stop, print install instructions |
| `gh auth status` fails | Stop, print `gh auth login` |
| `git push` rejected (non-fast-forward) | Stop, ask user before force operations |
| `gh pr create` fails due to existing PR | Re-run auto-route (will land in Phase B) |
| Merge conflict on `gh pr merge` | Stop, instruct user to rebase/merge locally |
| Required status check not yet started | Print pending state, do not retry-loop |
