# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Mermaid diagrams: standalone `.mmd` / `.mermaid` files render as diagrams; inline ` ```mermaid ` blocks in Markdown hydrate after sanitization (#95)
- Stash archive: hide stashes from default listings without deleting; toggle in UI / REST API / MCP
- Version history: every update snapshots the prior state into `stash_versions`; UI offers Confluence-style diff comparison and one-click restore
- FTS5 full-text search: BM25-ranked results with per-field snippets (`name`, `description`, `tags`, `filenames`, `file_content`); private-use Unicode sentinels (U+E000 / U+E001) prevent false-positive matches on user-typed `**bold**`
- MCP tools: `archive_stash`, `refresh_tools`, `get_rest_api_spec`, `get_mcp_spec`
- `TRUST_PROXY` environment variable: gates trust of `X-Forwarded-*` headers for client-IP detection (rate limiting) and base-URL resolution (OpenAPI / MCP spec output)
- Mobile-optimized layout with slide-in sidebar, hamburger menu, and touch targets

### Changed

- Rate-limit moved from Edge middleware to Node route handlers, so successful login can clear the per-IP counter and prevent legitimate users from being locked out after 10 logins
- Rate-limit now applied to `/api/admin/auth`, `/api/tokens/validate`, and `/api/admin/session` (the latter previously bypassed the limit when a token was supplied — a brute-force oracle)
- `getBaseUrl()` and rate-limit IP detection now ignore `X-Forwarded-*` unless `TRUST_PROXY=1`
- `restoreStashVersion` is now wrapped in a single transaction (R3 #105)
- `checkAdmin()` returns 401 vs 403 consistently with `checkScope()` (R3 #105)
- StashGraphCanvas UI strings translated to English (R3 #105)

### Fixed

- Multiple security and atomicity hardening rounds (#97 R1, #99 R2, #105 R3): metadata-array rejection, token-validate rate limit, FTS sentinel collision, transactional archive+update, useClickOutside touch on iOS Safari, popstate cancellation, mermaid hydration race, build-info NaN fallback, and many more — see #96 for the rolling list

## [1.0.0] - 2026-02-11

### Added

- Multi-file stash storage with name, description, tags, and key-value metadata
- REST API with full CRUD operations and Bearer token authentication
- MCP server with Streamable HTTP and stdio transports for AI agent integration
- Token-efficient MCP tools: selective file access, summary-only listings, confirmation-only writes
- Web GUI with dark theme, card/list views, syntax highlighting (30+ languages)
- Full-text search across stash names, descriptions, filenames, and file content
- Tag combobox with auto-complete and free-form creation
- Metadata key-value editor with key suggestions and expand/collapse
- URL routing with deep links to individual stashes (`/stash/:id`)
- Auto-filename: first file inherits stash name during creation
- Access log tracking for API, MCP, and UI access
- Password-based admin login with configurable session duration
- API token management with scopes (Read, Write, Admin, MCP)
- Settings area with API management, Swagger UI explorer, storage statistics
- OpenAPI 3.0 schema and MCP specification endpoints
- Docker support with multi-stage builds and GitHub Actions CI/CD
- One-click copy for files, API endpoints, and spec documents
