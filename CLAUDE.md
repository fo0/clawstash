# CLAUDE.md — Project Guide

> **Session-Start:** Read `MEMORY.md` and `SCRATCHPAD.md` to restore context from previous sessions.
> After every implementation, follow the review process in `agent_docs/review_process.md`.
> Unresolved findings go to `BACKLOG.md` as defined in `agent_docs/backlog_process.md`.
> Long-term knowledge goes to `MEMORY.md`, temporary working context to `SCRATCHPAD.md`.
> See `agent_docs/memory_process.md` for rules on what goes where.
> **Diagram generation:** When the user requests an architecture diagram, follow `agent_docs/diagram_prompt.md`.
>   Write result to `docs/ARCHITECTURE.mmd` and generate `docs/ARCHITECTURE.svg`.
> **GitNexus:** If `.gitnexus/` exists, use GitNexus skills in `.claude/skills/gitnexus/` for code navigation,
>   impact analysis, refactoring, and review. Run `npx gitnexus analyze` to rebuild the index when stale.
> **On "done" / "fertig":** Commit uncommitted changes (if any), and if the work relates to a GitHub
>   issue, comment on it (in English) with a summary and close it. Do NOT push unless explicitly asked.
> **On GitHub issue work:** Reference the issue number in commit messages (e.g. `fix: resolve crash #42`).

## Project Overview

**ClawStash** is an AI-optimized stash storage system, built specifically for AI agents with REST API, MCP (Model Context Protocol) support, and a web GUI.

**Core features:**
- Text and file storage with multi-file support per stash
- Name + Description: Separate title and AI-optimized description per stash
- Archive: Hide stashes from default listings without deleting (toggle in UI, API, and MCP)
- REST API for programmatic access with Bearer token auth
- MCP Server for direct AI agent integration (Streamable HTTP + stdio)
- Web dashboard with dark-theme GUI (card/list view)
- Tags (Combobox), Metadata (Key-Value Editor), Full-text search
- Access log tracking via API, MCP, and UI
- Admin login gate with session management
- Settings area with API management, token CRUD, and storage statistics
- Version history with diff comparison and restore functionality
- Mobile-optimized responsive layout with collapsible sidebar

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | TypeScript (strict mode) | 5.7 |
| Framework | Next.js (App Router) | 16 |
| Frontend | React | 19 |
| Database | SQLite (better-sqlite3) | 12 |
| MCP Server | @modelcontextprotocol/sdk | 1.27 |
| Validation | Zod | 3.24 |
| Code Editor | react-simple-code-editor, PrismJS | 0.14, 1.30 |
| Markdown Rendering | marked | 17 |
| Diagram Rendering | mermaid (lazy-loaded) | 11 |
| Diagram Viewer (zoom/pan) | react-zoom-pan-pinch | 3.7 |
| Text Diffing | diff (jsdiff) | 8 |
| Module System | ESM (`"type": "module"`) | — |
| Containerization | Docker (multi-stage, standalone output) | — |
| CI/CD | GitHub Actions → GHCR | — |
| Linter/Formatter | — (not configured) | — |
| Test Framework | — (not configured) | — |

## Project Structure

See `agent_docs/project-structure.md` for the full directory tree (extracted to keep this file under the 40k-char budget).

## Commands

```bash
# Install
npm install                # Install dependencies

# Development
npm run dev                # Start Next.js dev server (frontend + API on port 3000)

# Automated Checks (in this order)
npx tsc --noEmit           # Type checking
npm run build              # Production build (Next.js)

# Production
npm start                  # Start production server (Next.js)

# Other
npm run mcp                # Start MCP server (stdio transport)

# GitNexus (if enabled)
npx gitnexus analyze       # Rebuild index (after structural changes or stale index)
```

> **Note:** No linter or test framework configured yet. When added, extend automated checks:
> ```bash
> npm run lint             # Lint + Format (when configured)
> npm run test             # Tests (when configured)
> ```

## Key Patterns

### Database Layer (src/server/db.ts)

- Single `ClawStashDB` class encapsulates all database operations
- SQLite with WAL mode for concurrent read performance
- Stash columns: `name` (title), `description` (AI description), `tags` (JSON), `metadata` (JSON), `archived` (INTEGER 0/1)
- JSON columns for tags (array) and metadata (object) stored as TEXT
- Transactions for multi-table operations (stash + files)
- Language auto-detection from file extension
- **FTS5 Full-Text Search**: `stashes_fts` virtual table indexes name, description, tags, filenames, and file content with Porter stemming and unicode61 tokenizer
- `searchStashes(query, options)` returns BM25-ranked results with match snippets (`**highlighted**` markdown); falls back to LIKE search on FTS syntax error
- FTS index auto-synced on `createStash()`, `updateStash()`, `deleteStash()`, and `importAllData()` (full rebuild via `rebuildFtsIndex()`)
- `buildFtsQuery()` sanitizes user input, strips FTS5 special chars, adds prefix matching (`word*`), implicit AND for multi-word queries
- `archiveStash(id, archived)` toggles archive status without creating a new version
- `listStashes` returns `StashListItem[]` (summary without metadata/file content, includes file sizes and total_size); supports `archived` filter (true/false/undefined)
- `getStashMeta(id)` returns stash with metadata + file info (filename, language, size) and total_size, without file content
- `getStashFile(stashId, filename)` returns a single file's content by stash ID and filename
- `stashExists(id)` lightweight existence check (SELECT 1, no data loaded)
- `getAllMetadataKeys()` aggregates unique keys across all stashes
- `getTagGraph(options?)` returns tag nodes with counts + co-occurrence edges; supports focus tag with BFS depth traversal, min_weight, min_count, and limit filters
- `access_log` table tracks all read/write access per stash (source: api/mcp/ui)
- `api_tokens` table stores API tokens (SHA-256 hashed, with scopes and prefix)
- **Version History**: `stash_versions` + `stash_version_files` tables track every version of a stash
- `stashes` table has `version` column (integer, starts at 1, incremented on every update)
- `createStash()` sets `version=1` AND creates a v1 record in `stash_versions` (initial state stored for comparison)
- `updateStash()` snapshots the current state into `stash_versions` before applying changes (skips if version record already exists, e.g. v1 from creation)
- Auto-migration: existing stashes get `version=1` column added; stashes without version records get v1 backfilled
- `getStashVersions(id)` returns version list (descending) with file counts and sizes, includes current live version at top when newer than latest stored
- `getStashVersion(id, version)` returns full version snapshot with file content; falls back to current live stash data if version matches current version
- `restoreStashVersion(id, version)` restores an old version as a new update (creates new version)

### DB Singleton (src/server/singleton.ts)

- Uses `globalThis` to persist DB instance across Next.js HMR reloads in development
- Single `getDb()` function returns the shared `ClawStashDB` instance
- Prevents multiple DB connections during hot module replacement
- Periodic session cleanup via `setInterval` (every 1 hour), interval reference stored on `globalThis` to prevent duplicates during HMR

### Middleware (src/middleware.ts) + Rate Limiter (src/server/auth-rate-limit.ts)

- **CORS**: Permissive `Access-Control-Allow-Origin: *` on all `/api/*` and `/mcp` routes — required for AI agent access from any origin (localhost, LAN, remote)
- **Preflight**: OPTIONS requests return 204 with CORS headers
- **Security headers**: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-DNS-Prefetch-Control: off` on all routes
- **No restrictive headers** (X-Frame-Options, HSTS, CSP) — intentionally omitted to not break agent/LAN/localhost access
- **Rate limiting** lives in `src/server/auth-rate-limit.ts` (NOT in middleware) so the success path can clear the per-IP counter. Invoked from:
  - `/api/admin/auth` (POST): 10 attempts / 15 min per IP, recorded only on real attempts; cleared on successful login
  - `/api/tokens/validate` (POST): 10 attempts / 15 min per IP (separate scope), neutralizes the brute-force oracle
  - `/api/admin/session` (GET): same `token-validate` scope when a token is supplied
- **Client-IP detection**: `getClientIp()` honours `X-Forwarded-For`/`X-Real-IP` only when `TRUST_PROXY=1` (or `=true`). Without it, missing IP falls back to a per-request random key (no shared `'unknown'` bucket)

### Input Validation (src/server/validation.ts)

- Zod schemas for all POST/PATCH API routes: `CreateStashSchema`, `UpdateStashSchema`, `CreateTokenSchema`
- Size limits per field: name (500), description (50K), tags (50 × 100 chars), metadata (50 keys), files (100 × 255 char filenames, 10MB content each), language (50 chars)
- Filename validation rejects path traversal characters (`/`, `\`, `..`, null bytes)
- Token scopes auto-deduplicated via `.transform()`
- `MAX_IMPORT_SIZE` (100MB) exported for the import route
- `formatZodError()` helper converts Zod issues to a single human-readable error string
- Zod validates and strips unknown fields, preventing arbitrary data injection

### Authentication (src/server/auth.ts)

- Shared auth utility used by all protected API route handlers
- Two token types: Admin sessions (`csa_` prefix) and API tokens (`cs_` prefix)
- Admin login via `ADMIN_PASSWORD` env variable (password-based, not static token)
- Session duration configurable via `ADMIN_SESSION_HOURS` (default: 24, 0 = unlimited)
- Admin sessions stored as SHA-256 hashes in `admin_sessions` table with expiry
- Scope hierarchy: admin implies all, write implies read
- Auth functions work with `NextRequest` objects (adapted from Express middleware)
- When `ADMIN_PASSWORD` is not set, all features are open (dev mode)

### API Route Handlers (src/app/api/)

- Next.js Route Handlers replace Express routes
- Shared helpers in `src/app/api/_helpers.ts`: `checkScope()`, `checkAdmin()`, `getBaseUrl()`, `parsePositiveInt()`, `parseJsonBody()`, `getRequestInfo()`
- `checkScope(req, scope)` validates auth and returns `{ db, source }` or error `NextResponse`
- `checkAdmin(req)` validates admin-level auth
- `getBaseUrl(req)` extracts base URL from request headers for OpenAPI schema
- `parseJsonBody(req)` returns `{ data }` or `{ error: NextResponse }` for safe JSON parsing
- `getRequestInfo(req)` extracts IP and user agent for access logging
- All handlers use `NextRequest`/`NextResponse` from `next/server`
- Dynamic route parameters via `params` promise (Next.js 16 convention)

### API Token Management (src/app/api/tokens/)

- Token format: `cs_` prefix + 48 hex chars (24 random bytes)
- Tokens stored as SHA-256 hashes in the database
- Admin protection via shared auth (admin session or API token with admin scope)
- Scopes: read, write, admin, mcp

### Spec Architecture (Single Source of Truth)

- **`src/server/shared-text.ts`**: Shared text constants (`CLAWSTASH_PURPOSE`, `CLAWSTASH_PURPOSE_PLAIN`, `TOKEN_EFFICIENT_GUIDE`) used by OpenAPI, MCP spec, and MCP server description
- **`src/server/tool-defs.ts`**: Single source of truth for all MCP tool definitions (name, description, Zod schema, return type). Consumed by mcp-server.ts, mcp-spec.ts, and `/api/mcp-tools`
- **`src/server/mcp-spec.ts`**: Uses `zodToJsonSchema()` to auto-convert Zod schemas from tool-defs.ts to JSON Schema for the spec output. Pulls data types from OpenAPI. No hand-written JSON Schema.
- **`src/server/openapi.ts`**: Uses `CLAWSTASH_PURPOSE_PLAIN` from shared-text.ts for `info.description`
- **`src/components/api/api-data.ts`**: Contains only frontend-specific helpers (scope labels, config builders, `getRestConfigText()` which derives endpoints from OpenAPI JSON). No hardcoded tool or endpoint lists — those come from the server.
- **Data flow**: tool-defs.ts → mcp-server.ts (registration) + mcp-spec.ts (JSON Schema) + /api/mcp-tools (summaries) → frontend

### OpenAPI Schema (src/server/openapi.ts)

- Dynamic base URL from request headers
- Documents all stash, token, and system endpoints
- Uses shared purpose text from `shared-text.ts`
- Served at `/api/openapi`

### API Client (src/api.ts)

- Centralized fetch wrapper with error handling
- Module-level auth token (`setAuthToken()`) included in all requests automatically
- All methods return typed promises
- Query parameters built with URLSearchParams
- Sends `X-Access-Source: ui` header for UI access tracking
- `getTagGraph()` method wraps `/api/stashes/graph` endpoint (supports tag, depth, min_weight, min_count, limit params)

### State Management (src/App.tsx)

- Simple React state (no external state lib)
- Login gate: shows `LoginScreen` when `ADMIN_PASSWORD` is set and user not authenticated
- Admin session token stored in localStorage for remember-me
- View modes: `home | view | edit | new | settings | graph`
- URL routing via `pushState` / `popstate`: `/stash/:id`, `/new`, `/settings`, `/graph`
- Stash list loaded via `useEffect` with search/filter dependencies
- Tags loaded separately from stashes (stable callback, refreshed on save/delete)
- Tag filter state (`filterTag`) shared between Sidebar dropdown and Dashboard tag clicks
- Archive filter state (`showArchived`): when false (default), archived stashes are hidden from listings; toggle in sidebar and dashboard header
- Recent tags (`recentTags`) tracked in App.tsx, persisted to `clawstash_recent_tags` in localStorage (max 3, auto-cleaned against current tags list)
- Layout persisted to localStorage
- Settings navigation integrated into sidebar (section state in App.tsx), default section: 'welcome' (Admin Dashboard)
- Logout button in sidebar footer (only shown when auth is required)
- SSR safety: `getStoredPreference`, `getStoredAdminToken`, `getInitialRoute` guard against `window` being undefined
- Mobile sidebar: `sidebarOpen` state controls slide-in overlay sidebar on mobile (< 640px); navigation actions auto-close sidebar; hamburger menu + mobile header shown only on mobile via CSS

### Footer (src/components/Footer.tsx)

- Build info fetched at runtime via `useEffect` from `/api/version` endpoint
- Build info includes: git branch, commit hash (short), build date (ISO string)
- Version displayed as date-based format `vYYYYMMDD-HHMM` (derived from build date)
- Build details (branch, commit, date) shown on the right side when toggled, next to GitHub link
- Mobile: build details shown in separate panel below footer row

### Graph Viewer (src/components/GraphViewer.tsx)

- Force-directed tag graph visualization using HTML Canvas (no external graph library)
- Nodes represent tags, sized by usage count; edges represent tag co-occurrence across stashes
- **ForceAtlas2-inspired physics**: degree-proportional gravity, 1/dist repulsion (longer-range than 1/dist²), cross-cluster repulsion boost, weight-proportional edge attraction with log-scaled ideal distance, velocity damping + speed cap
- Interactive: drag nodes, pan canvas, zoom (scroll wheel with cursor-relative zoom)
- **Cluster-aware layout**: Initial placement groups nodes by cluster (sectors for multi-cluster, circle for single); hub nodes (highest degree) placed at cluster center; cluster cohesion force pulls nodes toward their group centroid during simulation
- **Cluster coloring**: Connected component detection (union-find) assigns distinct colors to tag groups; 8-color palette for dark backgrounds; falls back to single green when only 1 cluster
- **Count badges**: Usage count displayed inside node circles (when radius >= 10)
- **Glow effect**: Top 20% tags by usage count get radial gradient glow behind node
- **Edge styling**: Dashed lines for weak connections (weight <= 2), solid for strong; thickness/opacity scales with weight; weight labels shown at high zoom (> 1.5x)
- **Zoom-dependent labels**: Low zoom (< 0.7x) hides all labels except hovered; normal shows tag name; high zoom (> 1.5x) shows "tag (count)"
- **Node click popup**: Click opens floating dialog (not navigation) showing tag name, usage count, top 5 connected tags with weights, top 3 stashes using tag; actions: "Filter Dashboard" (navigate to filtered home) and "Focus Graph" (server-side subgraph)
- **Focus mode**: Server-side graph filtering via `api.getTagGraph({ tag, depth })` with BFS depth traversal (1-4); depth controls (+/-) in header; clear button returns to full graph
- Hover highlights connected nodes and edges
- Graph icon button in sidebar header (next to ClawStash logo) for quick access
- Reset button rebuilds graph with fresh cluster-based layout (or clears focus mode)
- Popup closes on: click outside, Escape key, click another node
- HiDPI/Retina support via devicePixelRatio scaling
- Empty state shown when no tags exist

### Search Overlay (src/components/SearchOverlay.tsx)

- Alt+K global keyboard shortcut opens a centered search overlay (similar to GitHub's command palette)
- Global `keydown` listener in App.tsx toggles `searchOpen` state
- Debounced search (200ms) using the existing `api.listStashes()` endpoint with limit of 12 results
- Keyboard navigation: Arrow Up/Down to move selection, Enter to open stash, Escape to close
- Mouse: click result to open, click backdrop to close
- Shows stash name, description preview (truncated to 100 chars), tags (max 3 + overflow count), file count, relative time
- Visual Alt+K badge displayed in sidebar search input as discoverability hint
- Accessible: `role="dialog"`, `aria-label`, focus management (auto-focus input on open)
- Resets state (query, results, active index) on each open

### Stash Viewer TOC (src/components/StashViewer.tsx)

- **Table of Contents** for stashes with 2+ markdown files: collapsible panel above file list in the Content tab
- TOC shown only when `renderPreview` is on and stash has multiple markdown files
- **File-level entries**: Click to smooth-scroll to the file container (uses `id="stash-file-{index}"` on `.viewer-file` divs)
- **Heading entries**: Extracts h1–h3 headings from rendered markdown HTML via `extractHeadings()` (DOMParser-based)
- **Cross-file heading disambiguation**: `renderMarkdown(content, idPrefix)` prepends `f{index}-` prefix to heading IDs when TOC is active, preventing collisions across files
- Heading extraction runs inside the `renderedContent` useMemo alongside markdown rendering (single DOMParser pass per file, cached)
- Collapsible via chevron toggle (`tocExpanded` state, default expanded)
- Accessible: `<nav aria-label="Table of contents">`, semantic anchor links with `href`

### Stash Editor (src/components/editor/)

- Split into focused sub-components: `StashEditor.tsx` (main form), `FileCodeEditor.tsx`, `TagCombobox.tsx`, `MetadataEditor.tsx`
- Code editor: `react-simple-code-editor` with PrismJS syntax highlighting
- Language-aware highlighting: auto-detected from file extension via `src/languages.ts`
- Tag Combobox: search/select existing tags, free-type new tags, displayed as pills below input
- Metadata Key-Value Editor: add/remove entries, key suggestions from existing stashes, expand/collapse (first 3 visible)
- Auto-filename: first file name auto-syncs with stash name during creation (until manually edited)
- `MetadataEditor` exports `metadataToEntries()` and `entriesToMetadata()` conversion helpers

### API Management (src/components/api/)

- Split into focused sub-components: `ApiManager.tsx` (tab container), `TokensTab.tsx`, `RestTab.tsx`, `McpTab.tsx`, `SwaggerViewer.tsx`
- `api-data.ts` contains only frontend-specific helpers (scope labels, config builders). No hardcoded tool/endpoint lists.
- `ApiManager` orchestrates tab state and lazy-loads OpenAPI/MCP spec/tools data from server
- `SwaggerViewer` handles external Swagger UI script loading with error fallback
- Clipboard operations use shared `copyToClipboard()` utility from `src/utils/clipboard.ts`

### Hooks (src/hooks/)

- **useClipboard.ts**: Clipboard hooks with 3-state feedback (idle/copied/failed)
  - `useClipboardBase<T>()`: Internal generic base hook (state + timeout + cleanup)
  - `useClipboard()`: Single copy button — returns `{ status, copied, copy }`
  - `useClipboardWithKey()`: Multiple copy buttons in lists — returns `{ copy, isCopied(key), isFailed(key) }`
- **useClickOutside.ts**: `useClickOutside(ref, callback, enabled?)` — closes dropdowns on outside clicks. Used by Sidebar (tag filter), TagCombobox, MetadataEditor.

### Shared Utilities (src/utils/)

- `clipboard.ts`: `copyToClipboard()` with modern Clipboard API + fallback for non-HTTPS
- `format.ts`: `formatDate()`, `formatDateTime()`, `formatRelativeTime()` — centralized date formatting used by Sidebar, StashViewer, StashCard, TokensTab
- `markdown.ts`: `renderDescriptionMarkdown()` — renders stash descriptions as sanitized Markdown HTML (Marked + DOMParser sanitization, external links in new tab). Used by StashViewer and StashCard.
- `mermaid.ts`: `renderMermaid(code)` — lazy-loads the `mermaid` lib via dynamic `import()`, initializes once with `theme: 'dark'` + `securityLevel: 'strict'`, returns `{svg?, error?}` (no throw). Shared by `<MermaidDiagram>` (`.mmd` files) and the inline ` ```mermaid ` markdown hydration effect in StashViewer.

### Mermaid Rendering (src/utils/mermaid.ts, src/components/MermaidDiagram.tsx)

- `mermaid` npm lib is lazy-loaded via dynamic `import()` on first use — kept out of the initial bundle (Next.js auto-code-splits dynamic imports)
- Single shared render entry point: `renderMermaid(code)` returns `{svg?, error?}`; the lib is initialized exactly once with `theme: 'dark'`, `securityLevel: 'strict'`, `fontFamily: 'inherit'`
- **Two render paths sharing the util:**
  - Standalone `.mmd` / `.mermaid` files → React component `<MermaidDiagram>` rendered directly in `StashViewer`
  - Inline ` ```mermaid ` blocks in Markdown → marked custom `code` renderer emits `<div class="mermaid-placeholder" data-mermaid-source="BASE64">`, hydrated by a `useEffect` in `StashViewer` after `dangerouslySetInnerHTML`
- File extensions `.mmd` / `.mermaid` registered in `src/server/detect-language.ts` (server-side persistence) and `src/languages.ts` (frontend display + `RENDERABLE_LANGUAGES` set)
- Errors render inline as `.mermaid-error` blocks (red border, message + source echoed) — no app crash
- Toggle Raw ⇄ Preview reuses the existing `renderPreview` toggle (Mermaid is part of `RENDERABLE_LANGUAGES`)
- Theme: ClawStash is dark-only today; `mermaid.initialize` is called once with `theme: 'dark'`. Re-render hook is in place (deps include `renderedContent`/`renderPreview`/`activeTab`) so future theme switching can re-init + force re-hydration trivially.
- **Zoom/pan toolbar** for the standalone `.mmd` viewer (`MermaidDiagram` component): + / − / Fit / 1:1 / Reset / Fullscreen buttons, current zoom % display, mouse-wheel zoom with Ctrl/Cmd modifier, pinch zoom on touch, drag to pan. Keyboard shortcuts (`+` / `-` / `0` / `f` / `Esc`) when the viewer has focus or is fullscreen. Initial render auto-fits to width; persistent zoom per stash file via `localStorage["clawstash_mermaid_zoom_${stash.id}:${filename}"]`. Powered by `react-zoom-pan-pinch`. Inline ` ```mermaid ` blocks in Markdown intentionally stay as static SVGs (separate DOM hydration path; small diagrams in practice).

### Language Utility (src/languages.ts)

- Maps file extensions to PrismJS grammar keys (65+ extensions, 30+ languages)
- `highlightCode(code, language)`: PrismJS highlighting with safe HTML-escape fallback
- `detectLanguageFromContent(content)`: Heuristic content-based language detection (HTML, XML, JSON, Markdown)
- `isRenderableLanguage(lang)`: Check if a language supports rendered preview (markdown, markup/HTML)
- `getLanguageDisplayName(lang)`: Human-readable label for PrismJS language keys

### MCP Server (src/server/mcp-server.ts, src/server/mcp.ts)

- Factory function `createMcpServer(db)` in `mcp-server.ts` registers all tools
- Tool definitions (name, description, Zod schema) imported from `tool-defs.ts` — only handlers are defined in mcp-server.ts
- Passes `def.schema.shape` to `server.tool()` (MCP SDK expects raw Zod shape, not ZodObject)
- Streamable HTTP transport at `/mcp` endpoint (Next.js route handler in `src/app/mcp/route.ts`)
- Stdio transport via `npm run mcp` for local CLI integration (`src/server/mcp.ts`)
- Token-efficient design: `read_stash` returns metadata + file sizes by default (no content)
- `read_stash_file` for selective single-file content access
- `create_stash`/`update_stash` return confirmation summaries, not echoed content

### MCP Spec Generator (src/server/mcp-spec.ts)

- Generates comprehensive MCP specification as markdown text
- Tool input schemas auto-derived from Zod schemas in `tool-defs.ts` via `zodToJsonSchema()` (no hand-written JSON Schema)
- Pulls data type schemas from OpenAPI spec (`getOpenApiSpec()`) for shared data model definitions
- Served at `/api/mcp-spec` as `text/plain`
- `getMcpOnboardingText(baseUrl)` wraps the MCP spec with self-onboarding instructions (quick start, recommended workflow)
- Onboarding served at `/api/mcp-onboarding` as `text/plain` (no auth required) for initial AI self-onboarding via REST
- `getMcpRefreshText(baseUrl)` wraps the MCP spec with update-focused framing for connected AI agents
- MCP `refresh_tools` tool returns the refresh text so connected AIs can periodically update their tool knowledge

## Coding Conventions

- **Language**: All UI text and documentation in English
- **Module System**: ESM (`"type": "module"` in package.json)
- **Formatting**: 2-space indentation, single quotes in TS
- **Imports**: Named imports, `@/*` path aliases for server-side imports in route handlers
- **Components**: Functional React components with TypeScript interfaces for props
- **Component Organization**: Complex features split into sub-directories (`api/`, `editor/`) with focused, single-responsibility files. Shared components in `shared/`, utilities in `utils/`.
- **API Route Handlers**: Use `checkScope()`/`checkAdmin()` helper functions for auth instead of Express middleware
- **CSS**: Global CSS with CSS custom properties (no CSS-in-JS), BEM-like class naming. Responsive breakpoints: 640px (mobile), 768px (tablet), 1200px (medium), 1600px/2000px (large/extra-large). Mobile layout uses slide-in sidebar overlay, dedicated mobile header with hamburger menu, and touch-optimized targets.
- **Error Handling**: Try/catch in async handlers, error state in UI components
- **TypeScript**: Strict mode enabled, `noEmit`, target ES2022, Next.js plugin

## API / Interfaces

REST API with Bearer token auth + MCP Server for AI agent integration (Streamable HTTP + stdio).

- Full REST API reference: `docs/api-reference.md`
- MCP tools and patterns: `docs/mcp.md`
- OpenAPI spec served at `/api/openapi`
- MCP spec served at `/api/mcp-spec`

## Git Conventions

- **Branch Naming:** `claude/{description}-{shortId}` for agent branches, `feature/{name}` for manual
- **Commit Messages:** Conventional Commits: `type(scope): description #issue` (types: feat, fix, chore, refactor, docs)
- **Merge Strategy:** Squash merge for PRs
- **CI/CD:** GitHub Actions: type-check -> build -> Docker push to GHCR (`docker-publish.yml`)

## Dependency Management

- **New dependencies:** Only after user approval with reasoning.
- **devDependencies:** Can be added without approval for tooling/testing.
- **Lock file:** `package-lock.json` — always commit.

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3000` | No |
| `DATABASE_PATH` | Path to SQLite database file | `./data/clawstash.db` | No |
| `NODE_ENV` | Environment mode | `development` | No |
| `ADMIN_PASSWORD` | Admin password for login (unset = open access) | — | No |
| `ADMIN_SESSION_HOURS` | Admin session duration in hours (0 = unlimited) | `24` | No |
| `TRUST_PROXY` | Trust `X-Forwarded-*` headers (set to `1` or `true` when behind nginx, Traefik, Cloudflare, etc.) | off | No (recommended behind a reverse proxy) |

## GitNexus — Code Intelligence

GitNexus provides graph-based code intelligence via MCP tools. Use it for navigating, understanding, and safely modifying the codebase.

### Available Tools (via MCP)

| Tool | Purpose | When to use |
|------|---------|-------------|
| `gitnexus_query` | Natural language code search | "Where is X used?", "How does Y work?" |
| `gitnexus_context` | Full context for a symbol (refs in/out) | Before modifying a function/class |
| `gitnexus_impact` | Upstream/downstream dependency map | Before refactoring, to assess blast radius |
| `gitnexus_rename` | Automated multi-file rename | Renaming symbols safely across the codebase |
| `gitnexus_detect_changes` | Verify scope of changes after edits | After any refactoring step |
| `gitnexus_cypher` | Raw Cypher queries on the code graph | Complex relationship queries |

### Quick Reference

```bash
# Rebuild index (when stale or after major changes)
npx gitnexus analyze
```

- If any tool returns "Index is stale" -> run `npx gitnexus analyze` first.
- Skill details: `.claude/skills/gitnexus/`
- Index directory `.gitnexus/` is gitignored.

## Testing

**Currently no test framework is configured.** Recommended setup:

- **Framework**: Vitest or Jest (both work well with Next.js)
- **Priority areas for tests**: Database layer (`src/server/db.ts`), authentication (`src/server/auth.ts`), API route handlers (`src/app/api/`)
- **CI integration**: The GitHub Actions workflow already supports conditional test execution (`npm test` or `npm run test:run`)

## Development Notes

- Next.js dev server runs on port 3000 with both frontend and API routes in one process
- In production, `next start` serves the full application (no separate frontend/backend)
- Next.js standalone output mode used for Docker (minimal `node server.js` deployment)
- The SQLite database auto-creates in the `data/` directory on first run
- DB singleton uses `globalThis` to survive Next.js HMR reloads in development
- MCP is available as Streamable HTTP at `/mcp` (Next.js route handler) and as stdio via `npm run mcp`
- Docker uses multi-stage build with Node 22-slim; requires python3/make/g++ for better-sqlite3 native addon compilation
- Docker volume maps to `/app/data` for database persistence
- CI/CD pipeline: type-check → (optional lint) → (optional test) → build → Docker push to GHCR

## Refactoring Notes

Refactoring does NOT happen automatically. Only upon explicit user request, when repeated code smells emerge across multiple files in review, or when a feature implementation is significantly harder than expected due to code structure. See `agent_docs/refactoring_guidelines.md` for principles.

- **`src/server/db.ts` (~1850 lines)**: Largest file by far. Strong candidate for splitting: token/session management → `TokenStore`, version history → `VersionStore`, FTS methods → `SearchStore`. (`detectLanguage()` is already extracted into `src/server/detect-language.ts`.)
- **`src/server/openapi.ts` (~680 lines)**: Large schema definition. Could adopt `@asteasolutions/zod-to-openapi` to generate from Zod schemas in `tool-defs.ts` (currently only MCP spec uses zodToJsonSchema; OpenAPI schemas are still hand-written).
- **`src/components/StashViewer.tsx` (~780 lines)**: Largest frontend component. File display, TOC, access log tab, and metadata display sections could be extracted into sub-components.
- **`src/components/Settings.tsx` (~560 lines)**: Could extract Welcome Dashboard and Storage Stats sections into dedicated sub-components within a `settings/` directory.
- **`src/languages.ts` (~340 lines)**: Extension map (65+ entries) and content-based detection heuristics are large but stable. Low priority.
- **No linter or test framework**: Adding ESLint + Vitest would significantly improve code quality assurance.
- **No Prettier config**: Adding Prettier would enforce consistent formatting.

## Documentation Rules

After every code change, check and update:

| File | Update when... |
|------|---------------|
| `CLAUDE.md` | New components, config files, patterns, or technical details |
| `README.md` | New features, value proposition, onboarding changes for users |
| `BACKLOG.md` | Unresolved review findings (Accepted/Deferred) — see `agent_docs/backlog_process.md` |
| `MEMORY.md` | Architecture decisions, gotchas, external deps, user preferences |
| `SCRATCHPAD.md` | Current working context, open questions, short-lived notes |
| `docs/api-reference.md` | New API endpoints, query parameters, examples |
| `docs/mcp.md` | New MCP tools, transport options, usage patterns |
| `docs/deployment.md` | Docker, CI/CD, or production setup changes |
| `docs/authentication.md` | Auth flow, token, or scope changes |
| `docs/ARCHITECTURE.mmd` | Structural changes (new modules, changed data flow, new external deps) |
| `.env.example` | New configuration options added |

### Size monitoring
If `CLAUDE.md` exceeds ~40,000 characters: extract the largest section into `agent_docs/` and replace with a one-line reference. Do this proactively — don't wait for warnings.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **clawstash** (2188 symbols, 3895 relationships, 189 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/clawstash/context` | Codebase overview, check index freshness |
| `gitnexus://repo/clawstash/clusters` | All functional areas |
| `gitnexus://repo/clawstash/processes` | All execution flows |
| `gitnexus://repo/clawstash/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
