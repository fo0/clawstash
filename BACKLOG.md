# Backlog

Review findings not immediately fixed. **Only work on these upon explicit request.**

## Open

| # | Date | Category | Priority | File:Line | Finding | Status | Source |
|---|------|----------|----------|-----------|---------|--------|--------|
| 3 | 2026-02-13 | Performance | P2 | server/db.ts | `getTagGraph()` builds full graph before filtering when a focus tag is given — acceptable at current scale but could optimize for large datasets by querying only relevant stashes | Accepted | Feature: Graph API |
| 5 | 2026-02-13 | Security | P2 | src/app/api/_helpers.ts:32 | `getBaseUrl()` trusts `X-Forwarded-Proto/Host` headers — standard for Next.js reverse proxy setup but potential URL injection into specs when not behind trusted proxy | Accepted | Review: Spec DRY refactor |
| 8 | 2026-02-15 | Performance | P2 | server/db.ts:getStashVersions | `getStashVersions()` returns all versions without pagination — could become slow with thousands of versions per stash | Deferred | Feature: Version History |
| 10 | 2026-02-15 | Dependency | P1 | package.json | **Zod 4 upgrade blocked**: `@modelcontextprotocol/sdk` v1.x uses `zod-to-json-schema` which is incompatible with Zod v4. MCP SDK v2 (with Zod 4 support) expected Q1 2026. Also requires replacing `zodToJsonSchema()` in `server/mcp-spec.ts` with built-in `z.toJSONSchema()` | Deferred | Dependabot PR #7 review |
| 11 | 2026-02-15 | Dependency | P2 | Dockerfile | **Node 25 Docker image not recommended**: Node 25 is non-LTS (odd version). Project targets Node 22 LTS (supported until April 2027). Wait for Node 24 LTS or Node 26 LTS. CI also hardcodes `node-version: "22"` | Accepted | Dependabot PR #1 review |
| 13 | 2026-02-22 | Performance | P2 | src/server/db.ts:searchStashes | N+1 queries in `searchStashes()` — per-result stash row + file list fetch. Matches existing `listStashes` pattern. Could optimize with batch JOIN for stash data. | Deferred | Feature: FTS5 Search |
| 15 | 2026-02-22 | Security | P2 | src/middleware.ts:76 | Rate limiter uses `x-forwarded-for` as IP key — spoofable without trusted proxy. All direct connections fall back to shared `'unknown'` bucket. Standard limitation for in-memory rate limiters. | Accepted | Feature: Security Hardening |
| 16 | 2026-02-22 | Performance | P2 | src/middleware.ts:30 | `setInterval` at module scope not HMR-protected (unlike singleton). Could create duplicate intervals during dev HMR. Harmless in production and dev (leaks empty Map cleanup). | Accepted | Feature: Security Hardening |
| 19 | 2026-02-25 | Edge Cases | P2 | src/server/db.ts:getAllTags | `getAllTags()` counts ALL stashes including archived — tag counts may not match visible stash list when archive filter is active. Could add optional `includeArchived` parameter. | Accepted | Feature: Stash Archive |
| 20 | 2026-02-25 | Code Smells | P2 | src/app/api/stashes/[id]/route.ts | Archive-only PATCH handler has verbose `undefined` checks for all fields. Could be simplified with a `hasContentChanges` helper. | Accepted | Feature: Stash Archive |

## Done

| # | Date | Done | Category | File:Line | Finding |
|---|------|------|----------|-----------|---------|
| 1 | 2026-02-13 | 2026-02-24 | Performance | src/components/GraphViewer.tsx | Animation loop runs at 60fps indefinitely — now stops when graph settles and restarts on interaction |
| 2 | 2026-02-13 | 2026-02-24 | Performance | src/components/GraphViewer.tsx | `edges.some()` O(nodes×edges) per frame for hover — replaced with precomputed adjacency Set |
| 4 | 2026-02-13 | 2026-02-24 | Security | server/openapi.ts, server/mcp-spec.ts | Unbounded Map caches keyed by baseUrl — replaced with single-entry caches |
| 6 | 2026-02-13 | 2026-02-24 | Code Smells | src/components/api/McpTab.tsx | Duplicate Streamable HTTP config in Examples section — removed |
| 7 | 2026-02-13 | 2026-02-24 | Performance | src/components/GraphViewer.tsx | `getGlowThreshold()` sorts every frame — now cached until nodes change |
| 9 | 2026-02-15 | 2026-02-24 | Code Smells | src/components/VersionHistory.tsx | Errors in version operations silently ignored — added error state with user-visible feedback |
| 12 | 2026-02-17 | 2026-02-24 | Bugs & Logic | src/server/db.ts:importAllData | `importAllData()` INSERT omitted `version` column — now includes version with fallback to 1 |
| 14 | 2026-02-22 | 2026-02-24 | Code Smells | src/server/openapi.ts | OpenAPI spec missing FTS5 search fields (`relevance`, `snippets`, `query`) — documented |
| 17 | 2026-02-22 | 2026-02-24 | Edge Cases | src/app/api/ (all POST/PATCH) | `req.json()` without try/catch returned 500 on malformed JSON — now returns 400 |
| 18 | 2026-02-22 | 2026-02-24 | Code Smells | src/server/openapi.ts | OpenAPI spec missing `/api/health` endpoint — documented with full request/response schemas |
