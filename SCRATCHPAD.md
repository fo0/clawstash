# Scratchpad -- Short-Term

Temporary working context. **Clean up aggressively -- delete when resolved.**

## Current Work

### GitNexus Code Review -- Round 1/3 (#97, Epic #96)

**Date:** 2026-04-26
**Branch:** ocean/97-gitnexus-basierte-code-review-runde-1-rii0

**Fixed (P1):**
- `src/server/db.ts:getStashVersion` -- replaced raw `JSON.parse(row.tags/metadata)` with `safeParseTags`/`safeParseMetadata` (parity with `rowToStash`/`rowToListItem`); corrupted version rows no longer crash the version-history feature.
- `src/app/api/stashes/[id]/versions/route.ts` -- added missing `db.logAccess(id, source, 'read_versions', ...)`.
- `src/app/api/stashes/[id]/versions/[version]/route.ts` -- added `read_version:N` audit log; disambiguated 404 (stash-not-found vs version-not-found).
- `src/app/api/stashes/[id]/versions/diff/route.ts` -- added `read_version_diff:V1..V2` audit log.

**Fixed (P2):**
- `src/app/api/admin/import/route.ts` -- pre-validate `Content-Length` header before `req.formData()` to reject oversized uploads without buffering body.
- `src/server/db.ts:searchStashes` -- warn-log on FTS5 -> LIKE fallback for production observability.
- `src/components/StashViewer.tsx` -- modernized Mermaid base64 helpers; replaced deprecated `escape()`/`unescape()` with `TextEncoder`/`TextDecoder` round-trip.

**Deferred to BACKLOG.md (entries 53-58):** P3 only.

**Skipped (already in BACKLOG):**
- `searchStashes` N+1 (#13/#45 deferred)
- middleware HMR-protected setInterval (#16 accepted)
- middleware XFF spoofability (#15 accepted)
- `getBaseUrl` XFP trust (#5 accepted)
- `listStashes` N+1 (#46 deferred)
- token query-param (#44 accepted)
- `detectLanguage` duplicate (#47 accepted)
- `requireScopeAuth`/`requireAdminAuth` duplication (#48 accepted)

**False positives surfaced by research subagents (documented for future rounds):**
- `App.tsx:61` -- `useState(getStoredAdminToken)` is the valid React lazy-initializer pattern, not a bug.
- Raw-file route -- DB lookup via parameterized SQL, not filesystem; no path traversal possible.
- `GraphViewer` rAF cleanup -- already guarded by `loopRunningRef.current`.
- `GraphViewer` HiDPI math -- canvas is dpr-scaled, screen coords are not; ordering is correct.
- `GraphViewer` popup race -- guarded by `prev.tag === node.id` check.

Next round (2/3): subtler logic issues, regressions, version snapshot timing, restore semantics.

## Open Questions

_(None)_

## Research Notes

_(None)_

## Temporary Notes

_(None)_
