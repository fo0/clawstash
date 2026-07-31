# Backlog Process

Review findings that were not immediately fixed are tracked in `BACKLOG.md` in the project root.

## Rules

1. **Backlog is memory, not a task queue** — items are ONLY worked on upon explicit user request. Never work through the backlog independently.
2. New entries go under `## Open`.
3. No duplicates — check if finding already exists before adding.
4. Done items move from `## Open` to `## Done` with completion date.
5. Stale entries — if the referenced function/component changed through other work, check if the finding is still relevant. Update or remove if obsolete.
6. Source traceability — every entry links back to the task/feature where it was found.
7. Escalation — P2 findings that block 3+ different features get escalated to P1.
8. **IDs are globally unique and never reused** — the next `#` is `max(id) + 1` across **both** `## Open` and `## Done`, not `max(id)` of the section you are writing into. An ID keeps its number when the entry moves from Open to Done. Reuse breaks `Closes BACKLOG #N` commit traceability: `#120`, `#121` and `#122` were each handed out twice (June vs. July 2026 review batches) because a batch restarted numbering from the Open section alone.
9. **Repairing a collision — renumber only the unreferenced twin.** An ID that already appears in a commit message, a PR title or a code comment must keep its number; renumbering it silently breaks the `Closes BACKLOG #N` trail that rule 8 exists to protect. Decide per twin:
   - **Exactly one twin is referenced** → renumber the other to `max(id) + 1` and note the move in its Finding cell (this is how `#121` became `#149` on 2026-07-27).
   - **Both twins are referenced** (or both are already in `## Done`) → renumber neither. Disambiguate in place by writing the ID as `#N (YYYY-MM-DD)` — the entry's original Date — in the `#` column, and add an `ID note:` sentence to each Finding cell naming the twin and the reference that pins it. `#120` and `#122` are carried this way.
   - Either way the disambiguated form is what you cite afterwards, e.g. `BACKLOG #120 (2026-06-12)`.

## BACKLOG.md Format

```markdown
# Backlog

Review findings not immediately fixed. **Only work on these upon explicit request.**

## Open

| #   | Date       | Category    | Priority | File:Line       | Finding                 | Status   | Source             |
| --- | ---------- | ----------- | -------- | --------------- | ----------------------- | -------- | ------------------ |
| 1   | 2026-02-13 | Performance | P2       | server/db.ts:42 | N+1 query in stash list | Deferred | Feature: Dashboard |

## Done

| #   | Date       | Done       | Category | File:Line         | Finding            |
| --- | ---------- | ---------- | -------- | ----------------- | ------------------ |
| 1   | 2026-02-10 | 2026-02-13 | Security | server/auth.ts:18 | Missing rate limit |
```

### Location Format

Use `File -> Function/Component` instead of line numbers. Line numbers go stale after every commit.

### Status Values

- **Deferred** — Recognized as valid, postponed intentionally (reasoning in Finding or Source)
- **Accepted** — Known limitation, accepted as-is for now
- **Escalated** — Upgraded from P2 to P1 due to repeated impact
