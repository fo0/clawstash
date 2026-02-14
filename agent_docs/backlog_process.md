# Backlog Process

Review findings that were not immediately fixed are tracked in `BACKLOG.md` in the project root.

## Rules

1. **Backlog is memory, not a task queue** — items are ONLY worked on upon explicit user request. Never work through the backlog independently.
2. New entries go under `## Open`.
3. No duplicates — check if finding already exists before adding.
4. Done items move from `## Open` to `## Done` with completion date.
5. Stale entries — if a file/line changed through other work, check if the finding is still relevant. Update or remove if obsolete.
6. Source traceability — every entry links back to the task/feature where it was found.

## BACKLOG.md Format

```markdown
# Backlog

Review findings not immediately fixed. **Only work on these upon explicit request.**

## Open

| # | Date | Category | Priority | File:Line | Finding | Status | Source |
|---|------|----------|----------|-----------|---------|--------|--------|
| 1 | 2026-02-13 | Performance | P2 | server/db.ts:42 | N+1 query in stash list | Deferred | Feature: Dashboard |

## Done

| # | Date | Done | Category | File:Line | Finding |
|---|------|------|----------|-----------|---------|
| 1 | 2026-02-10 | 2026-02-13 | Security | server/auth.ts:18 | Missing rate limit |
```

### Status Values

- **Deferred** — Recognized as valid, postponed intentionally (with reasoning in Source or Finding)
- **Accepted** — Known limitation, accepted as-is for now
