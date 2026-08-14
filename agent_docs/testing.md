# Testing

Framework, run command and layout live in `CLAUDE.md` -> _Testing_. This file carries the detail.

## Setup

- **Framework:** vitest 4.x. Config: `vitest.config.ts` -- node environment, `@/*` alias mirroring `tsconfig.json`, typecheck off (that is `npx tsc --noEmit`'s job, kept separate so a type error never masquerades as a test failure).
- **Run:** `npm test` (single run, what CI runs) · `npm run test:watch` (watch mode) · `npx vitest run path/to/file.test.ts` (single file, the targeted check after a change).
- **Collection:** `src/**/*.{test,spec}.{ts,tsx}` -- tests live in colocated `__tests__/` folders next to the module under test, not in a top-level `tests/` tree.

## Patterns

- Unit tests with a mocked DB or mocked `fetch`. No real network, no paid-API calls, no writes to a production database.
- Server-side suites build their own throwaway SQLite instance rather than reusing the app singleton -- `getDb()` is `globalThis`-backed and would leak state between files.
- React component tests use `@testing-library/react` + `jsdom`; DOM assertions go through `@testing-library/dom`.

## Constraints (canonical: `agent_docs/review_process.md` -> Test execution constraints)

- **Agent-runnable** without setup -- no manual env-var injection, no credentials prompt, no interactive login.
- **Zero-cost** -- no real API calls, no cloud resources, no production DB writes.
- **Deterministic** -- fake clocks, in-memory or temp-file DBs, mocked transports.
- **Self-contained** -- runnable on every change as part of `npm test`.

External boundaries (HTTP, DB, GitHub backup, MCP transport) are always mocked or replaced with an ephemeral in-memory fake. Real-service smoke/E2E tests only on explicit user request, never as a default automated check.

## Related

- Browser-level verification of UI changes: `.claude/skills/verify/SKILL.md`.
- Review gate that runs the suite: `agent_docs/review_process.md`.
