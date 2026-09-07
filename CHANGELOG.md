# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Security

- **BREAKING — MCP tools are now scope-gated.** `POST /mcp` checked the `mcp` scope and nothing else, and the tools themselves checked nothing at all, so a token holding **only** `mcp` could call `create_stash`, `update_stash`, `archive_stash` and `delete_stash` while every REST write route rejected the same token for a missing `write` scope — the MCP transport was a privilege-escalation path around the REST scope checks. `mcp` is now unambiguously a **transport gate** that permits connecting to `/mcp`, not a capability. Each tool declares its required scope in `src/server/tool-defs.ts` (the same source of truth that feeds the OpenAPI and MCP specs) and `createMcpServer` enforces it centrally on every `tools/call`, using the existing ladder from `src/server/auth.ts` (`admin` implies everything, `write` implies `read`): `write` for `create_stash` / `update_stash` / `archive_stash` / `delete_stash`, `read` for the tools that read stash data, and no additional scope for the three self-description tools (`get_mcp_spec`, `get_rest_api_spec`, `refresh_tools`), whose REST twins are unauthenticated too. A call the token's scopes do not cover returns a normal MCP tool error (`isError: true`) naming the missing scope — nothing is written and no exception crosses the transport.

  **Migration.** Affected: any agent whose token carries `mcp` but not `write` (or not `read`) — its tool calls now fail with the scope error instead of succeeding. Fix: create a new token with the scopes `read`, `write` and `mcp` under **Settings > API & Tokens** and swap it into the agent's MCP client config. **Expect to have to do this**, because the documentation disagreed with itself: `docs/openclaw-onboarding-prompt.md` and `README.md` did tell you to create the token with `read`, `write` and `mcp` (such a token keeps working unchanged), but the two places an agent is most likely to have followed — the self-onboarding endpoint `GET /api/mcp-onboarding` ("token needs `mcp` scope") and `docs/mcp.md` ("Create an API token with the `mcp` scope") — named only `mcp` until this release. A token created by following either of those two has to be reissued. Unaffected regardless: `admin` tokens, open mode (no `ADMIN_PASSWORD`), and the local **stdio** transport (`npm run mcp`), where the MCP client spawns the server as a local process with the operator's own privileges and there is no token to check, so it keeps full access.

### Added

- Stash viewer: "Download all" saves every file of a multi-file stash in one text file, next to "Collapse all" above the file list. Saving such a stash previously meant one Download click per file — and a burst of them is throttled by most browsers. The bundle is the exact format "Copy All" puts on the clipboard (one `// === filename ===` header per file), now built in one place so the two cannot drift; the file is named after the stash (`deploy-notes.txt`, or `stash-<id>.txt` when the name is empty or slugifies to nothing)
- Graph views: the arrangement on screen can be saved as a PNG. Both the tag graph and the stash graph gained a "PNG" button next to "Reset" that writes `clawstash-tag-graph-<date>.png` / `clawstash-stash-graph-<date>.png` — exactly what is visible, including the layout the user dragged into place, the current zoom and pan. The image is composited onto the view's own background first, because the canvas itself is transparent and the light labels would be unreadable otherwise; a browser that refuses the canvas export leaves the button reading "Failed" instead of doing nothing
- Stash editor: files can be folded away. Every file row carries a collapse chevron next to its filename, and a stash with more than one file gets a "Collapse all" / "Expand all" toggle in the Files header — the same affordance the viewer has always had. A folded row keeps its filename and language inputs editable and replaces the code editor with a one-line summary (size and line count) that expands it again on click. Editing file 9 of 12 no longer means scrolling past eight open editors; nothing is persisted and nothing is touched in the form state, so folding is safe mid-edit
- Agent self-onboarding, generated from one source of truth (`src/server/agent-guide.ts`) so no two surfaces disagree: the MCP server now returns usage `instructions` on `initialize` (the channel MCP clients put into the model's context), exposes the guides as resources (`clawstash://guide/skill`, `clawstash://guide/onboarding`), and gained `get_server_info` — one call that returns the token's scopes, which tools it can call and which need a higher scope, the size limits the server enforces, every endpoint of the instance, the build version (with `read`) and next steps. Over REST: `GET /api/agent-skill` serves a SKILL.md in Agent Skills format (when to store, workflow with the REST twin of every tool, naming/tagging conventions, limits, errors, maintenance), `GET /llms.txt` is a discovery index for agents that only know the host, and `GET /api/mcp-onboarding` now leads with the operational guide before the full specification. The web GUI offers a ready-to-paste onboarding prompt (Settings → API & Tokens → MCP API), and the one-time token banner offers the same prompt with the new token filled in
- Upgrade guidance for agents: `check_version` and `GET /api/version` carry an `upgrade` block — copy-pasteable steps for Docker Compose and a plain Node checkout, a GitHub compare URL listing the commits between the running build and `main`, and the changelog link — so an agent can hand the user a command instead of "please upgrade". Withheld (`null`) together with the build fingerprint for unauthenticated callers, because the compare URL names the running commit
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

- MCP tool descriptions now state what the server actually does: `list_stashes` / `search_stashes` name the real paging cap (1000, larger values clamped) and the ordering (last update, newest first), `read_stash` lists the `version` field it returns, and `refresh_tools` asks to be called after a failed tool call or an upgrade — not "periodically", since its response is the entire specification. `/api/mcp-onboarding` was restructured: operational guide (connect, when to store, workflow, conventions, limits, errors, maintenance) first, the specification second; the specification gained a Limits section and lists the MCP resources
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

- Graph view: the back button (and Escape) returned to the dashboard even when the graph had been opened from a stash via its "Analyze" button — the stash was lost on the way back. Both now return to that stash (the button reads "Back to stash"), including after a reload of the `/stash/:id/graph` deep link; a graph opened from the sidebar still leads back to the dashboard
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
