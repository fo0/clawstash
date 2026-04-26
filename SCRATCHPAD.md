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

### Round 1 -- iteration 2 (2026-04-26)

A second review pass surfaced bugs the first iteration missed; six parallel research subagents audited db, components, server, api, mcp, hooks again with the explicit "don't re-find iteration-1 fixes" framing.

**Fixed (P1):**
- `src/utils/markdown.ts` + `src/components/StashViewer.tsx` -- **XSS bypass**: `attr.value.trimStart().startsWith('javascript:')` was case-sensitive, allowing `JaVaScRiPt:alert(1)` and tab/newline-prefixed schemes through. Replaced with shared `isUnsafeUrl()` helper that strips ASCII control chars + whitespace, lowercases, and checks `javascript:` / `vbscript:` / `data:text/html`. Applied at both render time (Marked link renderer) and post-render (DOMParser sanitiser). Now also restricts the URL-attr filter to `href`/`src`/`xlink:href`/`action`/`formaction` instead of stripping `javascript:` from arbitrary attributes.
- `src/server/db.ts` -- replaced the raw `JSON.parse` cluster (`syncFtsIndex`, `rebuildFtsIndex`, `getAllTags`, `getAllMetadataKeys`, `getTagGraph`, `updateStashRelations`, `rebuildStashRelations`, `getStashGraph`) with `safeParseTags`/`safeParseMetadata` so a single corrupted row no longer 500s the listings, FTS rebuild, graph endpoints, or import post-processing. Migration 8 backfill loop wrapped in try/catch.
- `src/app/api/admin/logout/route.ts` -- previously deleted any token-hash that matched `admin_sessions` regardless of caller identity. Now requires `validateAuth(...).source === 'admin_session'` first, so unauthenticated callers cannot enumerate or invalidate admin sessions.
- `src/app/api/admin/import/route.ts` -- iteration-1 Content-Length pre-validation was bypassable when the header is absent (chunked uploads). Now rejects missing/invalid Content-Length up-front (411/400) before reading the body.
- `src/app/api/stashes/[id]/files/[filename]/raw/route.ts` -- `decodeURIComponent` could throw `URIError` on a malformed `%`, surfacing as a 500. Now wrapped with try/catch returning 400. Also added explicit `charset=utf-8` and a `Content-Disposition: inline; filename*=UTF-8''…` header so non-ASCII bytes render correctly across browsers/proxies.
- `src/components/api/SwaggerViewer.tsx` -- `existingScript.addEventListener('load'/'error', …)` had no matching `removeEventListener` in cleanup. Repeated mounts (e.g. tab-switching) leaked listeners on the same script element. Now tracked + removed.
- `src/components/Settings.tsx` (StorageSection import handler) -- async `await` chain after `confirm()` ran setState even after unmount. Added `sectionMountedRef` guard.
- `src/components/StashViewer.tsx` (access-log fetch) and `src/components/VersionHistory.tsx` (version list fetch) -- both racy: switching stashes while a fetch was in-flight could overwrite the new stash's data with the old stash's response. Both now use a `cancelled` flag pattern.

**Fixed (P2):**
- `src/app/api/tokens/validate/route.ts` -- now uses the shared `extractToken()` so callers can pass `Authorization: Bearer` *or* `?token=` (matching every other endpoint). Hand-rolled header parsing replaced.

**Deferred to BACKLOG.md (entries 25 marked Done, 59-71 added):**
- #25 moved to Done — SwaggerViewer listener leak now fixed.
- #59 — `/api/tokens/validate` is unauthenticated brute-force oracle (rate-limit not yet extended to this path).
- #60 — Login rate limiter counts successful + failed; locks out legit users.
- #61 — `MetadataSchema` accepts arrays; silently dropped on read.
- #62 — `searchStashes` snippet `**` literal triggers false positives on user content with `**` bold.
- #63 — `version.ts` synchronous `execSync` at module load.
- #64 — `StashEditor` `useRef(initialValue)` initializer side-effect bumps id counter every render.
- #65 — `/api/admin/export` builds full ZIP in memory.
- #66 — No audit log for import/export.
- #67 — `importAllData` no row-shape validation.
- #68 — `getTagGraph` truthiness guards skip `0` filter.
- #69 — `/mcp` collapses JSON-RPC errors to `-32603`.
- #70 — Token `scopes` parsed with raw `JSON.parse` (low risk, our writes).
- #71 — Footer `fetch('/api/version')` doesn't check `r.ok`.

**Skipped already-in-BACKLOG:**
- Iteration-1 set still applies (#13/#45, #16, #15, #5, #46, #44, #47, #48).

Next round (2/3): subtler logic issues, regressions, version snapshot timing, restore semantics, transaction atomicity.

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

## Open Questions

_(None)_

## Research Notes

_(None)_

## Temporary Notes

_(None)_
