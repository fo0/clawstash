---
name: ci
description: "Use when the user wants CI status, failed-job logs, or help fixing a red build. Triggered by /ci, 'CI status', 'check the build', 'fix CI', 'why is CI failing', 'look at the build'. Auto-routes by state: status / logs / fix-proposal. Reads logs locally — never re-triggers builds without explicit user command."
---

# CI — Continuous Integration Workflow

## When to Use

- After `git push` when CI may be running
- User says "/ci", "CI status", "check the build", "fix CI", "why is CI red", "look at the build"
- Triaging a failing branch / PR before merging

## Prerequisites

```bash
gh auth status && gh repo view --json name,owner
```

If `gh` is missing or unauthenticated -> print install/login instructions, stop. CI providers other than GitHub Actions: see "Other CI Providers" at the bottom.

## Auto-Routing (default `/ci`)

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD)
HEAD_SHA=$(git rev-parse HEAD)
RUNS=$(gh run list --branch "$BRANCH" --limit 5 --json databaseId,status,conclusion,headSha,name,workflowName)
```

Decision matrix:

| State                                                  | Action                              |
|--------------------------------------------------------|--------------------------------------|
| No runs found for branch                               | Phase A — report "no CI runs yet"   |
| Latest run still `in_progress` / `queued`              | Phase B — show running status       |
| Latest run `success`                                   | Phase C — green report              |
| Latest run `failure` / `cancelled` / `timed_out`       | Phase D — fetch logs + propose fix  |
| Latest run is for `headSha != HEAD_SHA` (stale)        | Phase E — note stale, run for prior SHA shown only on request |

Print detected phase before acting:
```
Detected: latest CI run failed (run #123, workflow "build"). Fetching failed-job logs.
```

## Phase A — No runs

Print:
```
No CI runs found for branch <branch>. Possible reasons:
- Branch not yet pushed -> git push -u origin <branch>
- Workflow not configured for this branch -> check .github/workflows/*.yml
- Workflow disabled -> gh workflow list
```

## Phase B — In progress

```bash
gh run watch <run-id> --exit-status   # only if user opted into wait
# Default (no waiting):
gh run view <run-id>
```

Report compact:
```
Run #<id> "<workflow>" in progress -- <N>/<M> jobs done.
URL: <url>
```

## Phase C — Green

```bash
gh run view <run-id> --json conclusion,createdAt,updatedAt,workflowName
```

Report:
```
Run #<id> "<workflow>" passed (<duration>).
URL: <url>
```

## Phase D — Failed (the work)

1. **Identify failed jobs:**
   ```bash
   gh run view <run-id> --json jobs --jq '.jobs[] | select(.conclusion == "failure") | {name, databaseId, conclusion}'
   ```
2. **Fetch failed-step logs only** (avoid pulling the whole run):
   ```bash
   gh run view <run-id> --log-failed
   ```
   For very large logs, narrow further:
   ```bash
   gh api "repos/{owner}/{repo}/actions/jobs/<job-id>/logs" | tail -n 500
   ```
3. **Classify failure** by signal in the log:
   - `npm ERR! / pip ERROR / cargo error[E` etc. -> build/install error
   - `lint`/`eslint`/`ruff`/`clippy` patterns -> lint failure
   - `FAIL`/`AssertionError`/`expect(...)` patterns -> test failure
   - `tsc / mypy / pyright` patterns -> type error
   - timeouts, OOM kills, runner shutdown -> infra failure (NOT a code defect — surface as such, do NOT propose code changes)
4. **Propose fix:**
   - Code defect -> propose minimal patch, apply only on user confirm
   - Infra failure (timeout/OOM/runner) -> propose retry: `gh run rerun <run-id> --failed`. **Never auto-rerun**, always confirm with user.
   - Flaky test (passes on rerun, repeats failing) -> log to BACKLOG.md as P1, do NOT silently retry to "make it pass"
5. **Verify fix locally** before any push — run the same commands locally per CLAUDE.md (lint/typecheck/test/build).

Report:
```
Run #<id> "<workflow>" failed.
Failed job: <name>
Failure type: <build | lint | test | type | infra>
Root cause: <one sentence>
Proposed fix: <patch summary OR "rerun (infra issue)">
Local verification: <results of running the same checks locally>
URL: <url>
```

## Phase E — Stale run

Runs exist but for a previous SHA. Print:
```
Latest CI run was for <stale-sha> (now HEAD is <head-sha>). Push and wait for fresh run, or use /ci --include-stale to inspect old runs.
```

## Explicit Sub-Commands

| Command                  | Behavior                                                  |
|--------------------------|-----------------------------------------------------------|
| `/ci` (default)          | Auto-route per matrix above                               |
| `/ci status`             | Force Phase B/C report, no log fetching, no fix proposal  |
| `/ci logs`               | Force Phase D log fetch even if green (rare debugging)    |
| `/ci fix`                | Force Phase D fix workflow                                |
| `/ci rerun`              | Confirm-then-`gh run rerun --failed` for the latest failed run |

## Hard Rules

- **Never `gh run rerun` without explicit user confirmation.** Reruns burn CI minutes and can mask flakiness.
- **Never propose a fix without reading the actual failed-step log.** Don't guess from job name.
- **Always verify locally** before pushing a CI fix — autonomy + zero-cost rule from CLAUDE.md applies.
- **Infra failures are NOT code defects.** Don't apply code changes for runner timeouts, network blips, or OOM kills.
- **Flaky tests go to BACKLOG.md, not silent retry.** Document the flake; don't paper over it.

## Other CI Providers (informational)

This skill targets GitHub Actions via `gh`. For other providers, the user is expected to invoke their own tooling. The skill should print:
```
Detected non-GitHub remote (<provider>). This skill targets GitHub Actions only.
Local equivalent: run lint/typecheck/test/build per CLAUDE.md, then push and inspect the provider's UI.
```

Common alternatives the user may run themselves:
- GitLab CI: `glab ci view`, `glab ci trace`
- CircleCI: `circleci local execute`, web UI logs
- Jenkins: web UI, `curl <jenkins>/job/<name>/lastBuild/consoleText`
