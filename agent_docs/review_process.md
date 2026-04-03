# Review Process

This file defines the mandatory review process executed after every implementation.

## Core Rules

1. **Every implementation triggers a full review** — no exceptions, no user prompt needed.
2. **Never commit without completed review** — all P0/P1 findings must be fixed first.
3. **Deterministic checks run first** — linter/types/tests catch what they catch. The review covers what tools cannot.
4. **Fix, don't list** — when a finding is actionable, fix it immediately. Don't just document it.
5. **Re-review after fixes** — if fixes touched code, re-run automated checks and re-review affected categories only.

## Severity Definitions

Severity is based on impact, not category:

| Severity | Definition | Examples |
|----------|-----------|---------|
| **P0 — Critical** | Can cause data loss, security breach, or production crash | SQL injection, unvalidated user input to exec(), missing auth checks on write endpoints, null deref in hot path |
| **P1 — Important** | Functionally incorrect, poor DX, or fast-growing tech debt | Wrong error handling, missing edge cases, unsafe type casts, deprecated APIs |
| **P2 — Nice-to-have** | Code smells, performance optimizations, style improvements | Duplicated code, missing memoization, magic numbers, long parameter lists |

## Workflow

```
Implement -> Run automated checks -> Fix failures ->
Code Review (all categories) -> Fix P0/P1 -> Re-check if needed ->
Regression & Complexity QA ->
Unresolved findings -> BACKLOG.md ->
Learnings/context -> MEMORY.md ->
UI Review (if UI changed) ->
Commit
```

### Error Recovery

- **Automated checks fail and fix is unclear:** Document the failure, inform the user, do NOT commit. Suggest possible causes.
- **Review finds issue outside current scope:** Log to BACKLOG.md with context, do not fix unless trivial.
- **Circular fix loop (fix breaks something else):** After 2nd iteration -> inform user. After 3rd -> stop completely, present full context of the loop.

## Automated Checks

Run in this order before the review:

```bash
npm install              # Dependencies current
npx tsc --noEmit         # Types pass
npm run build            # Build succeeds
```

> **Note:** No linter or test framework configured yet. When added, insert between install and build:
> ```bash
> npm run lint           # No lint errors (when configured)
> npm run test           # Tests green (when configured)
> ```

## Review Scope

### Default: Diff-based review
- Review is based on changed files (diff).
- Only changed and directly affected files are read.

### Full-read review (when needed)
- New files are always read completely.
- Security-critical changes: also check adjacent files.
- On explicit user request.

### Large-scale changes (>30 changed files)
- Group by change type (refactoring, feature, config etc.).
- P0 categories for all files.
- P1/P2 only for feature-relevant files, rest by sampling.

## Review Categories

Ordered by priority.

### P0 — Critical (always fix immediately)

| # | Category | What to check |
|---|----------|---------------|
| 1 | **Security** | Injection (SQL/command/template), XSS, CSRF, hardcoded secrets, unsafe dynamic code execution, prototype pollution, insecure crypto, improper auth checks, unvalidated input at trust boundaries |
| 2 | **Bugs & Logic Errors** | Off-by-one, null/undefined access, race conditions, incorrect conditionals, missing error handling at boundaries, wrong operator precedence, async pitfalls (unhandled promises, deadlocks), unclosed resources |

### P1 — Important (always fix, unless effort disproportionate -> Backlog)

| # | Category | What to check |
|---|----------|---------------|
| 3 | **Edge Cases** | Empty collections, null/undefined, boundary values (0, -1, MAX), empty strings, concurrent access, missing/malformed input, network failures, timeout handling |
| 4 | **Typing & Type Safety** | Correct types, no unsafe casts without reason, proper generics, exhaustive switch/union/enum handling, return type accuracy (TypeScript strict mode) |
| 5 | **Modern Coding Standards** | Idiomatic patterns (React 19, ES2024+, TypeScript strict), current best practices, no deprecated APIs, clean imports, proper naming, DRY, KISS, SRP |

### P2 — Contextual (review when relevant, defer freely)

| # | Category | What to check |
|---|----------|---------------|
| 6 | **Code Smells** | Duplicated code, dead code, high cyclomatic complexity, god objects/functions, long parameter lists, magic numbers/strings, tight coupling |
| 7 | **Performance** | Unnecessary re-renders/recomputations, missing memoization where beneficial, N+1 queries, unbounded loops/allocations, large imports that could be lazy-loaded |
| 8 | **Readability & Maintainability** | Clear naming, self-documenting code, consistent style, logical code organization, comments for non-obvious logic |

## Review Execution

1. **Re-read every changed file** with the Read tool — completely, not from memory. New files in full.
2. Evaluate each file against all categories (P0 first, then P1, then P2 where relevant).
3. Fix findings inline where possible.
4. Present results:

```
### Code Review Results

| # | Category | Sev | Status | Finding | Action |
|---|----------|-----|--------|---------|--------|
| 1 | Security | P0 | ⚠️ Fixed | Unvalidated input in X | Added validation |
| 2 | Bugs & Logic | P0 | ✅ Pass | — | — |
| 3 | Edge Cases | P1 | ✅ Pass | — | — |
| ... | ... | ... | ... | ... | ... |

Summary: X categories checked | Y fixed | Z deferred -> Backlog
```

**Status:** ✅ Pass | ⚠️ Fixed | ❌ Blocked (needs user input) | 💡 Deferred -> Backlog

## Fixing Rules

| Severity | Action |
|----------|--------|
| P0 findings | Fix immediately, always |
| P1 findings | Fix by default. Defer only if effort is clearly disproportionate — document reasoning in Backlog |
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

For isolated, clearly bounded subtasks:

| Task | When to delegate |
|------|-----------------|
| **Write tests** | >3 test files needed for a feature |
| **Doc updates** | >2 documentation files affected |
| **Refactoring chunks** | Independent subtasks of a larger refactoring |
| **Boilerplate generation** | Repetitive structures (migrations, schemas, config) |

The main agent retains responsibility for the review process itself.

## Commit Gate

Only commit when:

- [ ] All automated checks pass
- [ ] All P0/P1 findings are fixed (or explicitly deferred with reasoning)
- [ ] Deferred findings are logged in BACKLOG.md
- [ ] Learnings/context captured in MEMORY.md (if applicable)
- [ ] Documentation updated if needed
- [ ] Commit message follows project's Git Conventions
- [ ] UI review done (if UI changed)
