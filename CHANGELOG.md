# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- **BREAKING — MCP tools are now scope-gated.** `POST /mcp` checked the `mcp` scope and nothing else, and the tools themselves checked nothing at all, so a token holding **only** `mcp` could call `create_stash`, `update_stash`, `archive_stash` and `delete_stash` while every REST write route rejected the same token for a missing `write` scope — the MCP transport was a privilege-escalation path around the REST scope checks. `mcp` is now unambiguously a **transport gate** that permits connecting to `/mcp`, not a capability. Each tool declares its required scope in `src/server/tool-defs.ts` (the same source of truth that feeds the OpenAPI and MCP specs) and `createMcpServer` enforces it centrally on every `tools/call`, using the existing ladder from `src/server/auth.ts` (`admin` implies everything, `write` implies `read`): `write` for `create_stash` / `update_stash` / `archive_stash` / `delete_stash`, `read` for the tools that read stash data, and no additional scope for the three self-description tools (`get_mcp_spec`, `get_rest_api_spec`, `refresh_tools`), whose REST twins are unauthenticated too. A call the token's scopes do not cover returns a normal MCP tool error (`isError: true`) naming the missing scope — nothing is written and no exception crosses the transport.

  **Migration.** Affected: any agent whose token carries `mcp` but not `write` (or not `read`) — its tool calls now fail with the scope error instead of succeeding. Fix: create a new token with the scopes `read`, `write` and `mcp` under **Settings > API & Tokens** and swap it into the agent's MCP client config. **Expect to have to do this**, because the documentation disagreed with itself: `docs/openclaw-onboarding-prompt.md` and `README.md` did tell you to create the token with `read`, `write` and `mcp` (such a token keeps working unchanged), but the two places an agent is most likely to have followed — the self-onboarding endpoint `GET /api/mcp-onboarding` ("token needs `mcp` scope") and `docs/mcp.md` ("Create an API token with the `mcp` scope") — named only `mcp` until this release. A token created by following either of those two has to be reissued. Unaffected regardless: `admin` tokens, open mode (no `ADMIN_PASSWORD`), and the local **stdio** transport (`npm run mcp`), where the MCP client spawns the server as a local process with the operator's own privileges and there is no token to check, so it keeps full access.

### Added

- Stash viewer → History: a file in a version's detail view can be downloaded, not just copied — the current version has offered both since the viewer shipped. The saved name carries the version (`config.v3.yml`), so several revisions of the same file land side by side instead of overwriting each other
- Stash viewer → Access Log: source filter chips. Once the loaded page mixes channels, one chip per channel (API / MCP / UI) carries its count and narrows the list to it — answering "did an agent read this, or was that just me opening the tab?" without scanning every badge. Purely a view over the entries already fetched, so switching chips never refetches and the footer keeps naming the full fetched window
- Quick search: a result can be opened in a new tab. The rows are real links now, so Ctrl/Cmd+click, middle-click and the context menu work the way they already do on the dashboard cards and the sidebar rows, and `Ctrl`/`Cmd`+`Enter` opens the highlighted result without closing the overlay — so several stashes can be pulled out of one search
- File quick-jump bar in the stash viewer: a stash with more than one file gets a chip per file above the file list — one click scrolls to it and expands it if it was collapsed. Covers every file type, unlike the markdown-only table of contents
- Editor crash recovery: while the stash editor has unsaved changes its form state is mirrored into `localStorage` (debounced, capped at 512 KB, expires after 7 days). If the tab crashes or is closed before saving, reopening the same editor offers the work back with a Restore / Discard banner — including a warning when the stash has been updated elsewhere since. Deliberate exits (Cancel, Escape, guarded navigation, a successful save) drop the draft, so a discard never resurrects
- Sidebar keyboard navigation: `↓` in the sidebar search field steps straight into the stash list, `↑` / `↓` walk it, `Home` / `End` jump to the ends, and `↑` on the first row hands focus back to the search field. Previously `/` focused the field and the only way onward was Tab, one stop per row
- Comfort actions (#483): duplicate any stash into a pre-filled new one, open a stash in a new tab from the dashboard and the sidebar (Ctrl/Cmd/Shift/middle-click), and undo an accidental archive straight from the success toast
- One-click code copy (#443): every fenced code block in rendered Markdown carries a copy button — file preview and stash description in the viewer, dashboard cards opt out. Keyboard reachable, always visible on touch
- GitHub backup (#108): mirror all stashes into a GitHub repository via the Git Data API — scheduled (5 min – 24 h presets), debounced on every mutation, and manual ("Back up now" per stash + globally). "Sign in with GitHub" via OAuth device flow (own OAuth app client ID, no secret/callback) or PAT fallback; token stored AES-256-GCM-encrypted and redacted from all logs/errors. One commit per logical change, idempotent hash-based change detection, per-stash opt-out (`backup_enabled`), configurable delete mode, sync log + health indicator, new Settings section + viewer status bar. Docs: `docs/backup.md`
- Mermaid diagrams: standalone `.mmd` / `.mermaid` files render as diagrams; inline ` ```mermaid ` blocks in Markdown hydrate after sanitization (#95)
- Stash archive: hide stashes from default listings without deleting; toggle in UI / REST API / MCP
- Version history: every update snapshots the prior state into `stash_versions`; UI offers Confluence-style diff comparison and one-click restore
- FTS5 full-text search: BM25-ranked results with per-field snippets (`name`, `description`, `tags`, `filenames`, `file_content`); private-use Unicode sentinels (U+E000 / U+E001) prevent false-positive matches on user-typed `**bold**`
- MCP tools: `archive_stash`, `refresh_tools`, `get_rest_api_spec`, `get_mcp_spec`
- `TRUST_PROXY` environment variable: gates trust of `X-Forwarded-*` headers for client-IP detection (rate limiting) and base-URL resolution (OpenAPI / MCP spec output)
- Mobile-optimized layout with slide-in sidebar, hamburger menu, and touch targets

### Changed

- Stash viewer → GitHub backup bar: "Exclude" removes the stash's mirrored copy from the backup repository on the next sync, but it was a single click. It now uses the same two-click armed confirm as Delete, token delete, file remove and version restore; re-including a stash is additive and stays one click
- Stash viewer → History tab: the tab fetched and rendered the entire version history in one response (up to `STASH_VERSION_LIMIT` rows, unbounded when it is `0`) and presented it as complete. It now asks for 50 at a time, says how many versions are on screen when the list is cut off, and offers "Show more" — keeping the rows and any compare selection in place while the next page loads
- Stash viewer → version comparison: a multi-file diff rendered every changed file fully expanded. Each file now has a collapse toggle (plus "Collapse all" / "Expand all"), keeps its own +N / -M counts while folded, and stays expanded by default
- Sidebar stash list: an empty list now names what caused it (the active search, the tag filter, or neither) and offers the matching way out — clear search, clear tag filter, show archived, or create a stash. It also carries the dashboard's "Load more", so the stashes past the server's list cap are reachable without leaving the sidebar
- Settings → Storage: a successful export now reports the downloaded filename and size instead of saying nothing, an export failure is reported as an export failure instead of through the import error slot, and the import confirmation names the exact data it will replace (stash count, file count, total size) and points out that only a prior export can undo it
- Stash viewer → Access Log: the tab fetched 100 entries and rendered them as if they were the whole log. It now says how many entries are on screen when the log is cut off and offers "Show more" up to the 1000 the server returns
- Rate-limit moved from Edge middleware to Node route handlers, so successful login can clear the per-IP counter and prevent legitimate users from being locked out after 10 logins
- Rate-limit now applied to `/api/admin/auth`, `/api/tokens/validate`, and `/api/admin/session` (the latter previously bypassed the limit when a token was supplied — a brute-force oracle)
- `getBaseUrl()` and rate-limit IP detection now ignore `X-Forwarded-*` unless `TRUST_PROXY=1`
- `restoreStashVersion` is now wrapped in a single transaction (R3 #105)
- `checkAdmin()` returns 401 vs 403 consistently with `checkScope()` (R3 #105)
- StashGraphCanvas UI strings translated to English (R3 #105)

### Fixed

- Docker bind mounts (`./data:/app/data`) no longer break with `SQLITE_READONLY` / failing admin login: the container now starts as root, fixes data-directory ownership, and drops privileges to `node` (uid 1000) via `setpriv` before launching the server. Databases created by older root-running image versions are repaired automatically. Additionally, `ClawStashDB` fails fast with an actionable error when the database path is not writable, instead of letting SQLite silently fall back to read-only mode
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
