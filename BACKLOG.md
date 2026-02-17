# Backlog

Review findings not immediately fixed. **Only work on these upon explicit request.**

## Open

| # | Date | Category | Priority | File:Line | Finding | Status | Source |
|---|------|----------|----------|-----------|---------|--------|--------|
| 1 | 2026-02-13 | Performance | P2 | src/components/GraphViewer.tsx | Animation loop runs at 60fps indefinitely even after graph settles — should stop when velocity/alpha drops below threshold | Deferred | Feature: Graph Viewer |
| 2 | 2026-02-13 | Performance | P2 | src/components/GraphViewer.tsx | `edges.some()` in draw loop is O(nodes×edges) per frame for hover highlighting — should precompute adjacency set on hover change | Deferred | Feature: Graph Viewer |
| 3 | 2026-02-13 | Performance | P2 | server/db.ts | `getTagGraph()` builds full graph before filtering when a focus tag is given — acceptable at current scale but could optimize for large datasets by querying only relevant stashes | Accepted | Feature: Graph API |
| 4 | 2026-02-13 | Security | P2 | server/openapi.ts:15, server/mcp-spec.ts:15 | Spec caches (`specCache`, `mcpSpecCache`) are unbounded Maps keyed by baseUrl — attacker-controlled Host headers could grow cache without limit. Replace with single-entry or LRU cache. | Deferred | Review: Spec DRY refactor |
| 5 | 2026-02-13 | Security | P2 | server/index.ts:16-21 | `getBaseUrl()` trusts `X-Forwarded-Proto/Host` headers without Express `trust proxy` config — potential for URL injection into specs when not behind trusted proxy | Deferred | Review: Spec DRY refactor |
| 6 | 2026-02-13 | Code Smells | P2 | src/components/api/McpTab.tsx:158 | Examples section duplicates Streamable HTTP config that already appears in Client Configuration section above | Deferred | Review: Spec DRY refactor |
| 7 | 2026-02-13 | Performance | P2 | src/components/GraphViewer.tsx:319 | `getGlowThreshold()` sorts count array every frame (~60fps) — should cache until nodes change | Deferred | Feature: Graph Enhance |
| 8 | 2026-02-15 | Performance | P2 | server/db.ts:getStashVersions | `getStashVersions()` returns all versions without pagination — could become slow with thousands of versions per stash | Deferred | Feature: Version History |
| 9 | 2026-02-15 | Code Smells | P2 | src/components/VersionHistory.tsx | Errors in version fetch/view/compare silently ignored — should show error state to user | Deferred | Feature: Version History |
| 10 | 2026-02-15 | Dependency | P1 | package.json | **Zod 4 upgrade blocked** (PR #7): `@modelcontextprotocol/sdk` v1.x uses `zod-to-json-schema` which is incompatible with Zod v4 (`_parse is not a function`). Zod v4 has native `z.toJSONSchema()` replacement. Revisit when MCP SDK v2 ships (expected Q1 2026). Also requires replacing `zodToJsonSchema()` in `server/mcp-spec.ts` with built-in `z.toJSONSchema({ target: 'openapi-3.0' })` | Deferred | Dependabot PR #7 review |
| 11 | 2026-02-15 | Dependency | P2 | Dockerfile | **Node 25 Docker image not recommended** (PR #1): Node 25 is non-LTS (odd version). Project targets Node 22 LTS (supported until April 2027). Risk: native addon compatibility (better-sqlite3), undocumented behavior changes. Wait for Node 24 LTS or Node 26 LTS. CI workflow also hardcodes `node-version: "22"` — must be updated in sync | Accepted | Dependabot PR #1 review |
| 12 | 2026-02-17 | Bugs & Logic | P1 | src/server/db.ts:importAllData | `importAllData()` INSERT for stashes omits `version` column — defaults to 1 regardless of actual version. Imported stash_versions records may reference higher versions, causing version list inconsistency | Deferred | Review: Version History v0 fix |

## Done

| # | Date | Done | Category | File:Line | Finding |
|---|------|------|----------|-----------|---------|
