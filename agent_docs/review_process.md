# Review Process

This file defines the mandatory review process executed after every implementation.

## Core Rules

1. **Every implementation triggers a full review** — no exceptions, no user prompt needed.
2. **Never commit without completed review** — all P0/P1 findings must be fixed first.
3. **Deterministic checks run first** — linter/types/tests catch what they catch. The review covers what tools cannot.
4. **Fix, don't list** — when a finding is actionable, fix it immediately. Don't just document it.
5. **Re-review after fixes** — if fixes touched code, re-run automated checks and re-review affected categories only.

## Workflow

```
Implement → Run automated checks → Fix failures →
Code Review (all categories) → Fix P0/P1 → Re-check if needed →
Unresolved findings → BACKLOG.md →
UI Review (if UI changed) →
Commit
```

### Error Recovery

- **Automated checks fail and fix is unclear:** Document the failure, inform the user, do NOT commit. Suggest possible causes.
- **Review finds issue outside current scope:** Log to BACKLOG.md with context, do not fix unless trivial.
- **Circular fix loop (fix breaks something else):** Stop after 3 iterations, inform user with full context of the loop.

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

## Review Categories

Ordered by priority. P0 categories are always reviewed thoroughly. P1 categories are reviewed for all changes. P2 categories are reviewed when relevant.

### P0 — Critical (always fix immediately)

| # | Category | What to check |
|---|----------|---------------|
| 1 | **Security** | Injection (SQL/command/template), XSS, CSRF, hardcoded secrets, unsafe dynamic code execution, prototype pollution, insecure crypto, improper auth checks, unvalidated input at trust boundaries |
| 2 | **Bugs & Logic Errors** | Off-by-one, null/undefined access, race conditions, incorrect conditionals, missing error handling at boundaries, wrong operator precedence, async pitfalls (unhandled promises, deadlocks), unclosed resources |

### P1 — Important (always fix, unless effort disproportionate → Backlog)

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

1. **Re-read every changed file** with the Read tool — completely, not from memory.
2. Evaluate each file against ALL categories (P0 first, then P1, then P2 where relevant).
3. Fix findings inline where possible.
4. Present results:

```
### Code Review Results

| # | Category | Priority | Status | Finding | Action |
|---|----------|----------|--------|---------|--------|
| 1 | Security | P0 | ⚠️ Fixed | Unvalidated input in X | Added validation |
| 2 | Bugs & Logic | P0 | ✅ Pass | — | — |
| 3 | Edge Cases | P1 | ✅ Pass | — | — |
| 4 | Typing & Type Safety | P1 | ✅ Pass | — | — |
| 5 | Modern Coding Standards | P1 | ✅ Pass | — | — |
| 6 | Code Smells | P2 | ✅ Pass | — | — |
| 7 | Performance | P2 | 💡 Deferred | Could memoize expensive calc | → Backlog |
| 8 | Readability | P2 | ✅ Pass | — | — |

Summary: 8 categories checked | 1 fixed | 1 deferred → Backlog
```

**Status icons:**
- ✅ **Pass** — No issues found
- ⚠️ **Fixed** — Problem found and fixed
- ❌ **Blocked** — Needs user input to resolve
- 💡 **Deferred** — Logged to Backlog

## Fixing Rules

| Priority | Action |
|----------|--------|
| P0 findings | Fix immediately, always |
| P1 findings | Fix by default. Defer only if effort is clearly disproportionate — document reasoning |
| P2 findings | Fix if trivial. Otherwise defer to Backlog |

## UI Review (only when UI code changed)

- **Responsive:** Different screen sizes considered?
- **Accessibility:** Relevant attributes present?
- **Consistency:** Matches existing design system/patterns?

## Subagent Usage

For complex implementations, consider delegating isolated tasks to subagents to keep the main context clean:

- **Test writing** — when many test cases are needed for a feature
- **Documentation updates** — when multiple docs need updating after a large change
- **Refactoring subtasks** — when a refactoring is broken into independent chunks

The main agent retains responsibility for the review process itself.

## Refactoring Guidelines

Refactoring does NOT happen automatically. Only when:

- The user explicitly requests a refactoring pass
- Repeated code smells emerge across multiple files in review
- A feature implementation is significantly harder than expected due to code structure

### Principles

1. **No over-engineering** — Only refactor what provides measurable benefit (readability, maintainability, performance)
2. **AI-optimized code structure** — This code is primarily maintained by AI agents:
   - Prefer explicit over implicit patterns (easier for AI to parse and modify)
   - Keep files focused and single-responsibility (AI works better with smaller, clear files)
   - Use descriptive naming over clever abstractions
   - Maintain consistent patterns across similar components (AI can pattern-match)
   - Document non-obvious decisions inline (AI lacks project history context)
3. **Follow framework idioms** — Use current best practices of the language/framework, not custom abstractions
4. **Incremental refactoring** — Small chunks, each passes the full review cycle
5. **Extract, don't abstract** — Prefer extracting into focused files over abstract base classes or complex generics

## Commit Gate

Only commit when:

- [ ] All automated checks pass
- [ ] All P0/P1 findings are fixed (or explicitly deferred with reasoning)
- [ ] Deferred findings are logged in BACKLOG.md
- [ ] Documentation updated if needed
- [ ] UI review done (if UI changed)
