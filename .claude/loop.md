# Loop — default maintenance pass

One pass per iteration, in this order. Stop at the first item with real work, finish it, and report in one line. If
nothing is pending, say so in one line and do not invent work.

1. **Unfinished work from this session** — `SCRATCHPAD.md` holds the current task and open questions. Continue it.
2. **This branch's pull request** — new review comments, a failed CI run, or a merge conflict. Red build →
   `.claude/skills/ci/SKILL.md`. Comments and merge state → `.claude/skills/pr/SKILL.md`. Address them; do not just
   describe them.
3. **Verification** — `npm run format:check`, `npm run lint`, `npx tsc --noEmit`, `npm test`. Anything red is the work
   for this iteration.
4. **Backlog** — the top item in `BACKLOG.md` if it is small and self-contained. Anything larger stays where it is.

Rules for every iteration:

- No new initiatives outside this list.
- Irreversible actions — push, merge, branch deletion, the `docker-publish.yml` dispatch — only when they continue
  something this session already authorized.
- Nothing changed → one line, no summary of what was checked.
- Open point that needs a human → `BACKLOG.md`, then keep going. See `CLAUDE.md` → _Autonomy_.
