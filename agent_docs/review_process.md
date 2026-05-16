# Review Process

This file defines the mandatory review process executed after every implementation.

## Core Rules

1. **Every implementation triggers a full review** -- no exceptions, no user prompt needed.
2. **Never commit without completed review** -- all P0/P1 findings must be fixed first.
3. **Deterministic checks run first** -- linter/types/tests catch what they catch. The review covers what tools cannot.
4. **Fix, don't list** -- when a finding is actionable, fix it immediately. Don't just document it.
5. **Re-review after fixes** -- if fixes touched code, re-run automated checks and re-review affected categories only.

## Severity Definitions

Severity is based on impact, not category:

| Severity | Definition | Examples |
|----------|-----------|---------|
| **P0 -- Critical** | Can cause data loss, security breach, or production crash | SQL injection, unvalidated user input to exec(), missing auth checks on write endpoints, null deref in hot path |
| **P1 -- Important** | Functionally incorrect, poor DX, or fast-growing tech debt | Wrong error handling, missing edge cases, unsafe type casts, deprecated APIs |
| **P2 -- Nice-to-have** | Code smells, performance optimizations, style improvements | Duplicated code, missing memoization, magic numbers, long parameter lists |

## Workflow

```
Implement -> Run automated checks -> Fix failures ->
Code Review (all categories) -> Fix P0/P1 -> Re-check if needed ->
Regression & Complexity QA ->
Unresolved findings -> BACKLOG.md ->
Learnings/context -> MEMORY.md / SCRATCHPAD.md ->
UI Review (if UI changed) ->
Commit
```

### Error Recovery

- **Automated checks fail and fix is unclear:** Document the failure, inform the user, do NOT commit. Suggest possible causes.
- **Review finds issue outside current scope:** Log to BACKLOG.md with context, do not fix unless trivial.
- **Circular fix loop (fix breaks something else):** After 2nd iteration -> inform user. After 3rd -> invoke `.claude/skills/stuck/SKILL.md` -- the 4th attempt without user input is forbidden.

## Automated Checks

Run in this order before the review:

```bash
npm install              # Dependencies current
npx tsc --noEmit         # Types pass
npm test                 # Tests (vitest)
npm run build            # Build succeeds
```

> **Note:** No linter is configured yet. When added, insert between install and typecheck:
> ```bash
> npm run lint           # No lint errors (when configured)
> ```

### Test execution constraints (autonomy + zero-cost)

Apps in this workspace are built and verified by AI agents end-to-end. Tests must therefore be:

- **Agent-runnable without setup** -- no manual env-var injection, no credentials prompt, no interactive login.
- **Zero-cost** -- no real API calls (paid LLMs, SaaS APIs, payment processors), no real cloud resources, no real production DB writes.
- **Deterministic** -- fake clocks, fake random, in-memory DBs, mocked transports.
- **Self-contained** -- runnable on every change as part of the standard test command.

External boundaries (HTTP, DB, queue, LLM, payment, mail) -> always mock or use ephemeral in-memory fakes. Real-service smoke/E2E tests only on explicit user request, never as default automated check. If a planned test would hit a paid or production resource, replace it with a mocked equivalent or move it to a manual checklist.

## Review Scope

### Default: Diff-based review
- Review is based on changed files (diff).
- Only changed and directly affected files are read.

### GitNexus-enhanced review (if available)
- Use `gitnexus_impact` on changed functions to identify affected downstream code beyond the diff.
- Use `gitnexus_detect_changes` after fixes to verify change scope matches expectations.

### Full-read review (when needed)
- New files are always read completely.
- Security-critical changes: also check adjacent files.
- On explicit user request.

### Large-scale changes (>30 changed files)
- Group by change type (refactoring, feature, config etc.).
- P0 categories for all files.
- P1/P2 only for feature-relevant files, rest by sampling.
- If GitNexus available: use `gitnexus_impact` to prioritize files by downstream dependency count.

## Review Categories

Ordered by priority.

### P0 -- Critical (always fix immediately)

| # | Category | What to check |
|---|----------|---------------|
| 1 | **Security** | Injection (SQL/command/template), XSS, CSRF, hardcoded secrets, unsafe dynamic code execution, prototype pollution, insecure crypto, improper auth checks, unvalidated input at trust boundaries |
| 2 | **Bugs & Logic Errors** | Off-by-one, null/undefined access, race conditions, incorrect conditionals, missing error handling at boundaries, wrong operator precedence, async pitfalls (unhandled promises, deadlocks), unclosed resources |

### P1 -- Important (fix by default, defer only if disproportionate effort)

| # | Category | What to check |
|---|----------|---------------|
| 3 | **Edge Cases** | Empty collections, null/undefined, boundary values (0, -1, MAX), empty strings, concurrent access, missing/malformed input, network failures, timeout handling |
| 4 | **Typing & Type Safety** | Correct types, no unsafe casts without reason, proper generics, exhaustive switch/union/enum handling, return type accuracy (TypeScript strict mode) |
| 5 | **Modern Coding Standards** | Idiomatic patterns (React 19, ES2024+, TypeScript strict), current best practices, no deprecated APIs, clean imports, proper naming, DRY, KISS, SRP |

### P2 -- Contextual (review when relevant, defer freely)

| # | Category | What to check |
|---|----------|---------------|
| 6 | **Code Smells** | Duplicated code, dead code, high cyclomatic complexity, god objects/functions, long parameter lists, magic numbers/strings, tight coupling |
| 7 | **Performance** | Unnecessary re-renders/recomputations, missing memoization where beneficial, N+1 queries, unbounded loops/allocations, large imports that could be lazy-loaded |
| 8 | **Readability & Maintainability** | Clear naming, self-documenting code, consistent style, logical code organization, comments for non-obvious logic |

## Review Execution

1. **Re-read every changed file** with the Read tool -- completely, not from memory. New files in full.
2. Evaluate each file against all categories (P0 first, then P1, then P2 where relevant).
3. Fix findings inline where possible.
4. Present results:

```
### Code Review Results

| # | Category | Sev | Status | Finding | Action |
|---|----------|-----|--------|---------|--------|
| 1 | Security | P0 | Fixed | Unvalidated input in X | Added validation |
| 2 | Bugs & Logic | P0 | Pass | -- | -- |
| 3 | Edge Cases | P1 | Pass | -- | -- |
| ... | ... | ... | ... | ... | ... |

Summary: X categories checked | Y fixed | Z deferred -> Backlog
```

**Status:** Pass | Fixed | Blocked (needs user input) | Deferred -> Backlog

## Fixing Rules

| Severity | Action |
|----------|--------|
| P0 findings | Fix immediately, always |
| P1 findings | Fix by default. Defer only if effort is clearly disproportionate -- document reasoning in Backlog |
| P2 findings | Fix if trivial (<5 min). Otherwise defer to Backlog |

## Regression & Complexity QA

After all review fixes are applied, re-read the full implementation one more time:

| Check | What to look for |
|-------|-----------------|
| **Regressions** | Did a fix break existing behavior? Changed return values, removed fallbacks, altered control flow? |
| **Unnecessary complexity** | Did the implementation add indirection or branching that isn't needed? |
| **Consistency** | Do the changes fit the patterns in surrounding code? |

Rules:
- Re-read every changed file again (not from memory).
- If this pass finds issues, fix them and re-run automated checks. Do NOT loop more than once.

## UI Review (only when UI code changed)

- **Responsive:** Different screen sizes considered?
- **Accessibility:** Relevant attributes present?
- **Consistency:** Matches existing design system/patterns?

## Subagent Delegation

For isolated, clearly bounded subtasks. Pick the matching `subagent_type` instead of always defaulting to `general-purpose`.

| Task                              | When to delegate                | Recommended `subagent_type` |
|-----------------------------------|--------------------------------|-----------------------------|
| **Locate code / find symbols**    | Search across >3 paths or unknown location | `Explore` (read-only, fast, doesn't pollute main context) |
| **Plan refactoring/feature**      | Non-trivial, >3 files affected, architectural choice | `Plan` |
| **Write tests**                   | >3 test files for a feature    | `general-purpose` |
| **Doc updates**                   | >2 documentation files         | `general-purpose` |
| **Refactoring chunks**            | Independent subtasks of larger refactoring | `general-purpose` |
| **Boilerplate generation**        | Migrations, schemas, repetitive configs | `general-purpose` |
| **Independent code review**       | Second-opinion on diff         | `general-purpose` (or project-specific reviewer subagent if defined) |
| **Q about Claude Code/SDK/API**   | "Can Claude do X?", hooks, MCP, SDK questions | `claude-code-guide` |

## Subagent Selection Rules

- **Use `Explore` for read-only search.** Specify breadth: `quick` (single targeted), `medium` (moderate), `very thorough` (multiple locations). Do NOT use for code review or open-ended analysis -- it reads excerpts, will miss content past its window.
- **Use `Plan` before non-trivial implementation.** Then act on the plan in main thread, or hand the plan to `general-purpose` for execution.
- **Use `general-purpose` for write+execute** tasks. Default for "do this work" delegations.
- **Use `claude-code-guide` for tooling questions** about Claude Code itself (slash commands, hooks, MCP servers, SDK).
- **Parallelize independent work** -- multiple Agent calls in one message when no dependencies exist.
- **Prefer direct tools when target is known** -- `Read` for known path, `grep` via Bash for known symbol. Reserve subagents for open-ended or multi-step work.
- **Pass full context** -- subagents have no conversation history. Include file paths, line numbers, what was already tried, and the goal.
- **Trust but verify** -- a subagent's summary describes intent, not necessarily the actual change. Inspect diffs after write-capable subagents finish.

The main agent retains responsibility for the review process itself.

## Commit Gate

Only commit when:

- [ ] All automated checks pass
- [ ] All P0/P1 findings are fixed (or explicitly deferred with reasoning)
- [ ] Deferred findings are logged in BACKLOG.md
- [ ] Learnings/context captured in MEMORY.md or SCRATCHPAD.md (if applicable)
- [ ] Documentation updated if needed
- [ ] Commit message follows project's Git Conventions
- [ ] UI review done (if UI changed)
- [ ] (If GitNexus available) `gitnexus_detect_changes()` confirmed scope
