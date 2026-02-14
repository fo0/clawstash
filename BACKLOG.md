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

## Done

| # | Date | Done | Category | File:Line | Finding |
|---|------|------|----------|-----------|---------|
