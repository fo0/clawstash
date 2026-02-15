# CLAUDE.md — Project Guide

> After every implementation, follow the review process in `agent_docs/review_process.md`.
> Unresolved findings go to `BACKLOG.md` as defined in `agent_docs/backlog_process.md`.

## Project Overview

**ClawStash** is an AI-optimized stash storage system, built specifically for AI agents with REST API, MCP (Model Context Protocol) support, and a web GUI.

**Core features:**
- Text and file storage with multi-file support per stash
- Name + Description: Separate title and AI-optimized description per stash
- REST API for programmatic access with Bearer token auth
- MCP Server for direct AI agent integration (Streamable HTTP + stdio)
- Web dashboard with dark-theme GUI (card/list view)
- Tags (Combobox), Metadata (Key-Value Editor), Full-text search
- Access log tracking via API, MCP, and UI
- Admin login gate with session management
- Settings area with API management, token CRUD, and storage statistics
- Version history with diff comparison and restore functionality

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Language | TypeScript (strict mode) | 5.7 |
| Frontend | React, Vite | 19, 6 |
| Backend | Express, Node.js | 4, 22 |
| Database | SQLite (better-sqlite3) | 11 |
| MCP Server | @modelcontextprotocol/sdk | 1.12 |
| Validation | Zod | 3.24 |
| Code Editor | react-simple-code-editor, PrismJS | 0.13, 1.30 |
| Markdown Rendering | marked | 17 |
| Text Diffing | diff (jsdiff) | 7 |
| Module System | ESM (`"type": "module"`) | — |
| Containerization | Docker (multi-stage) | — |
| CI/CD | GitHub Actions → GHCR | — |
| Linter/Formatter | — (not configured) | — |
| Test Framework | — (not configured) | — |

## Project Structure

```
clawstash/
├── index.html                  # Vite entry point
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript config (strict, ES2022, ESNext modules)
├── vite.config.ts              # Vite config with API proxy, build info injection (port 3000 → 3001)
├── Dockerfile                  # Multi-stage Docker build (Node 22-slim)
├── docker-compose.yml          # Docker Compose deployment
├── .env.example                # Environment variables template
├── BACKLOG.md                  # Deferred review findings tracker
├── agent_docs/                 # Agent process documentation
│   ├── review_process.md       # Mandatory review process after every implementation
│   └── backlog_process.md      # Backlog tracking rules and format
├── .github/
│   └── workflows/
│       └── docker-publish.yml  # CI: Type-check, build, push to GHCR
├── server/                     # Backend
│   ├── index.ts                # Express server entry point (includes MCP HTTP endpoint)
│   ├── db.ts                   # SQLite database layer (ClawStashDB class)
│   ├── auth.ts                 # Shared auth utility (token extraction, validation, scope checking)
│   ├── shared-text.ts          # Shared text constants (PURPOSE, TOKEN_EFFICIENT_GUIDE) used across specs
│   ├── tool-defs.ts            # MCP tool definitions — single source of truth (Zod schemas + descriptions)
│   ├── mcp-server.ts           # MCP server factory (imports tool-defs.ts, defines handlers)
│   ├── mcp-spec.ts             # MCP spec generator (uses tool-defs.ts + zodToJsonSchema + OpenAPI data types)
│   ├── mcp.ts                  # MCP server stdio transport entry point
│   ├── openapi.ts              # OpenAPI 3.0 schema generator (uses shared-text.ts for description)
│   └── routes/
│       ├── admin.ts            # Admin auth routes (login/logout/session)
│       ├── stashes.ts          # REST API route handlers
│       └── tokens.ts           # API token management routes
├── src/                        # Frontend (React)
│   ├── main.tsx                # React entry point
│   ├── vite-env.d.ts           # Vite client types + BuildInfo global declaration
│   ├── App.tsx                 # Main app component, state management
│   ├── api.ts                  # API client (fetch wrapper)
│   ├── types.ts                # Shared TypeScript interfaces
│   ├── languages.ts            # PrismJS language detection, mapping, and highlighting utility
│   ├── hooks/
│   │   └── useClipboard.ts     # useClipboard + useClipboardWithKey hooks
│   ├── utils/
│   │   ├── clipboard.ts        # Copy-to-clipboard with fallback for non-HTTPS
│   │   └── format.ts           # Date formatting (formatDate, formatDateTime, formatRelativeTime)
│   ├── components/
│   │   ├── Sidebar.tsx         # Left sidebar with search, tag filter, stash list, settings nav, graph button
│   │   ├── Footer.tsx          # App footer with version, build info toggle, GitHub link
│   │   ├── Dashboard.tsx       # Home view with grid/list of stash cards
│   │   ├── GraphViewer.tsx     # Force-directed tag graph visualization (canvas-based)
│   │   ├── StashCard.tsx       # Individual stash card component
│   │   ├── StashViewer.tsx     # Stash detail view with file display, access log, version history tabs
│   │   ├── VersionHistory.tsx  # Version history list, detail view, compare selector, restore button
│   │   ├── VersionDiff.tsx     # GitHub-style diff view (green/red) using jsdiff library
│   │   ├── SearchOverlay.tsx    # Alt+K quick search overlay with keyboard navigation
│   │   ├── LoginScreen.tsx     # Password login gate
│   │   ├── Settings.tsx        # Settings/admin area (general, API, storage, about)
│   │   ├── shared/
│   │   │   ├── icons.tsx       # Shared Octicon-style icons
│   │   │   └── Spinner.tsx     # Loading spinner animation
│   │   ├── api/                # API management sub-components
│   │   │   ├── ApiManager.tsx  # Tab container: Tokens/REST/MCP tabs
│   │   │   ├── TokensTab.tsx   # Token CRUD + Quick Access spec copy
│   │   │   ├── RestTab.tsx     # REST API docs, Swagger explorer, examples
│   │   │   ├── McpTab.tsx      # MCP Server config, tools, examples
│   │   │   ├── SwaggerViewer.tsx # Swagger UI lazy-loader
│   │   │   └── api-data.ts     # Static data: endpoints, tools, scope labels, spec generators
│   │   └── editor/             # Stash editor sub-components
│   │       ├── StashEditor.tsx # Main create/edit form with file management
│   │       ├── FileCodeEditor.tsx # PrismJS code editor wrapper
│   │       ├── TagCombobox.tsx # Tag input with autocomplete dropdown
│   │       └── MetadataEditor.tsx # Key-value editor with suggestions
│   └── styles/
│       └── app.css             # Global styles (CSS custom properties)
└── data/                       # SQLite database directory (gitignored)
```

## Commands

```bash
# Install
npm install                # Install dependencies

# Development
npm run dev                # Start dev (Vite frontend + Express backend concurrently)

# Automated Checks (in this order)
npx tsc --noEmit           # Type checking
npm run build              # Production build (Vite)

# Production
npm start                  # Start production server (serves API + static frontend)

# Other
npm run mcp                # Start MCP server (stdio transport)
npm run preview            # Preview production build via Vite
```

> **Note:** No linter or test framework configured yet. When added, extend automated checks:
> ```bash
> npm run lint             # Lint + Format (when configured)
> npm run test             # Tests (when configured)
> ```

## Key Patterns

### Database Layer (server/db.ts)

- Single `ClawStashDB` class encapsulates all database operations
- SQLite with WAL mode for concurrent read performance
- Stash columns: `name` (title), `description` (AI description), `tags` (JSON), `metadata` (JSON)
- JSON columns for tags (array) and metadata (object) stored as TEXT
- Transactions for multi-table operations (stash + files)
- Language auto-detection from file extension
- `listStashes` returns `StashListItem[]` (summary without metadata/file content, includes file sizes and total_size)
- `getStashMeta(id)` returns stash with metadata + file info (filename, language, size) and total_size, without file content
- `getStashFile(stashId, filename)` returns a single file's content by stash ID and filename
- `stashExists(id)` lightweight existence check (SELECT 1, no data loaded)
- `getAllMetadataKeys()` aggregates unique keys across all stashes
- `getTagGraph(options?)` returns tag nodes with counts + co-occurrence edges; supports focus tag with BFS depth traversal, min_weight, min_count, and limit filters
- `access_log` table tracks all read/write access per stash (source: api/mcp/ui)
- `api_tokens` table stores API tokens (SHA-256 hashed, with scopes and prefix)
- **Version History**: `stash_versions` + `stash_version_files` tables track every version of a stash
- `stashes` table has `version` column (integer, starts at 1, incremented on every update)
- `updateStash()` snapshots the current state into `stash_versions` before applying changes (within transaction)
- `createStash()` sets `version=1` but does NOT create a version record (the stash IS v1; history starts on first update)
- Auto-migration: existing stashes get `version=1` column added
- `getStashVersions(id)` returns version list (descending) with file counts and sizes
- `getStashVersion(id, version)` returns full version snapshot with file content
- `restoreStashVersion(id, version)` restores an old version as a new update (creates new version)

### Authentication (server/auth.ts)

- Shared auth utility used by all protected routes (stashes, tokens, MCP)
- Two token types: Admin sessions (`csa_` prefix) and API tokens (`cs_` prefix)
- Admin login via `ADMIN_PASSWORD` env variable (password-based, not static token)
- Session duration configurable via `ADMIN_SESSION_HOURS` (default: 24, 0 = unlimited)
- Admin sessions stored as SHA-256 hashes in `admin_sessions` table with expiry
- Scope hierarchy: admin implies all, write implies read
- Stash routes use `requireScope()` Express middleware factory: GET requires `read` scope, POST/PATCH/DELETE require `write` scope
- MCP endpoint requires `mcp` or `admin` scope
- When `ADMIN_PASSWORD` is not set, all features are open (dev mode)

### API Token Management (server/routes/tokens.ts)

- Token format: `cs_` prefix + 48 hex chars (24 random bytes)
- Tokens stored as SHA-256 hashes in the database
- Admin protection via shared auth (admin session or API token with admin scope)
- Scopes: read, write, admin, mcp

### Spec Architecture (Single Source of Truth)

- **`server/shared-text.ts`**: Shared text constants (`CLAWSTASH_PURPOSE`, `CLAWSTASH_PURPOSE_PLAIN`, `TOKEN_EFFICIENT_GUIDE`) used by OpenAPI, MCP spec, and MCP server description
- **`server/tool-defs.ts`**: Single source of truth for all MCP tool definitions (name, description, Zod schema, return type). Consumed by mcp-server.ts, mcp-spec.ts, and `/api/mcp-tools`
- **`server/mcp-spec.ts`**: Uses `zodToJsonSchema()` to auto-convert Zod schemas from tool-defs.ts to JSON Schema for the spec output. Pulls data types from OpenAPI. No hand-written JSON Schema.
- **`server/openapi.ts`**: Uses `CLAWSTASH_PURPOSE_PLAIN` from shared-text.ts for `info.description`
- **`src/components/api/api-data.ts`**: Contains only frontend-specific helpers (scope labels, config builders, `getRestConfigText()` which derives endpoints from OpenAPI JSON). No hardcoded tool or endpoint lists — those come from the server.
- **Data flow**: tool-defs.ts → mcp-server.ts (registration) + mcp-spec.ts (JSON Schema) + /api/mcp-tools (summaries) → frontend

### OpenAPI Schema (server/openapi.ts)

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
- Recent tags (`recentTags`) tracked in App.tsx, persisted to `clawstash_recent_tags` in localStorage (max 3, auto-cleaned against current tags list)
- Layout persisted to localStorage
- Settings navigation integrated into sidebar (section state in App.tsx), default section: 'welcome' (Admin Dashboard)
- Logout button in sidebar footer (only shown when auth is required)

### Footer (src/components/Footer.tsx)

- Build info injected at compile time via Vite `define` (`__BUILD_INFO__` global)
- Build info includes: version (from package.json), git branch, build date (ISO string)
- Type declaration for `__BUILD_INFO__` in `src/vite-env.d.ts`

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

### Clipboard Hooks (src/hooks/useClipboard.ts)

- `useClipboardBase<T>()`: Internal generic base hook (state + timeout + cleanup), shared by both public hooks
- `useClipboard()`: Single copy button — returns `{ status, copied, copy }` with 3-state feedback (idle/copied/failed)
- `useClipboardWithKey()`: Multiple copy buttons in lists — returns `{ copy, isCopied(key), isFailed(key) }`
- Both hooks: proper timeout cleanup on unmount, rapid-click handling, error feedback

### Shared Utilities (src/utils/)

- `clipboard.ts`: `copyToClipboard()` with modern Clipboard API + fallback for non-HTTPS
- `format.ts`: `formatDate()`, `formatDateTime()`, `formatRelativeTime()` — centralized date formatting used by Sidebar, StashViewer, TokensTab

### Language Utility (src/languages.ts)

- Maps file extensions to PrismJS grammar keys (65+ extensions, 30+ languages)
- `highlightCode(code, language)`: PrismJS highlighting with safe HTML-escape fallback
- `detectLanguageFromContent(content)`: Heuristic content-based language detection (HTML, XML, JSON, Markdown)
- `isRenderableLanguage(lang)`: Check if a language supports rendered preview (markdown, markup/HTML)
- `getLanguageDisplayName(lang)`: Human-readable label for PrismJS language keys

### MCP Server (server/mcp-server.ts, server/mcp.ts)

- Factory function `createMcpServer(db)` in `mcp-server.ts` registers all tools
- Tool definitions (name, description, Zod schema) imported from `tool-defs.ts` — only handlers are defined in mcp-server.ts
- Passes `def.schema.shape` to `server.tool()` (MCP SDK expects raw Zod shape, not ZodObject)
- Streamable HTTP transport at `/mcp` endpoint (stateless, integrated in Express server)
- Stdio transport via `npm run mcp` for local CLI integration
- Token-efficient design: `read_stash` returns metadata + file sizes by default (no content)
- `read_stash_file` for selective single-file content access
- `create_stash`/`update_stash` return confirmation summaries, not echoed content

### MCP Spec Generator (server/mcp-spec.ts)

- Generates comprehensive MCP specification as markdown text
- Tool input schemas auto-derived from Zod schemas in `tool-defs.ts` via `zodToJsonSchema()` (no hand-written JSON Schema)
- Pulls data type schemas from OpenAPI spec (`getOpenApiSpec()`) for shared data model definitions
- Served at `/api/mcp-spec` as `text/plain`

## Coding Conventions

- **Language**: All UI text and documentation in English
- **Module System**: ESM (`"type": "module"` in package.json)
- **Formatting**: 2-space indentation, single quotes in TS
- **Imports**: Named imports, `.js` extensions for server-side ESM
- **Components**: Functional React components with TypeScript interfaces for props
- **Component Organization**: Complex features split into sub-directories (`api/`, `editor/`) with focused, single-responsibility files. Shared components in `shared/`, utilities in `utils/`.
- **Backend Middleware**: Auth checks use Express middleware factory pattern (`requireScope('read')`) instead of inline guard functions
- **CSS**: Global CSS with CSS custom properties (no CSS-in-JS), BEM-like class naming
- **Error Handling**: Try/catch in async handlers, error state in UI components
- **TypeScript**: Strict mode enabled, `noEmit` (Vite handles bundling), target ES2022

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/stashes` | GET | List stashes as summary (query: `?search=&tag=&page=&limit=`) |
| `/api/stashes` | POST | Create a new stash |
| `/api/stashes/stats` | GET | Get storage statistics |
| `/api/stashes/tags` | GET | List all tags with counts |
| `/api/stashes/metadata-keys` | GET | List all unique metadata keys |
| `/api/stashes/graph` | GET | Get tag relationship graph (query: `?tag=&depth=&min_weight=&min_count=&limit=`) |
| `/api/stashes/:id` | GET | Get a single stash with all files |
| `/api/stashes/:id` | PATCH | Update a stash |
| `/api/stashes/:id` | DELETE | Delete a stash |
| `/api/stashes/:id/files/:filename/raw` | GET | Get raw file content |
| `/api/stashes/:id/access-log` | GET | Get access log for a stash (`?limit=`) |
| `/api/stashes/:id/versions` | GET | List all versions of a stash (descending) |
| `/api/stashes/:id/versions/diff` | GET | Compare two versions (`?v1=&v2=`) |
| `/api/stashes/:id/versions/:version` | GET | Get a specific version snapshot with files |
| `/api/stashes/:id/versions/:version/restore` | POST | Restore an old version as current (creates new version) |
| `/api/tokens` | GET | List API tokens (admin-protected) |
| `/api/tokens` | POST | Create API token (admin-protected) |
| `/api/tokens/:id` | DELETE | Delete API token (admin-protected) |
| `/api/tokens/validate` | POST | Validate a Bearer token |
| `/api/admin/auth` | POST | Admin login with password |
| `/api/admin/logout` | POST | Invalidate admin session |
| `/api/admin/session` | GET | Check admin session status |
| `/api/openapi` | GET | OpenAPI 3.0 schema |
| `/api/mcp-spec` | GET | MCP specification (markdown with tool schemas and data types) |
| `/api/mcp-tools` | GET | MCP tool summaries (JSON, derived from tool-defs.ts) |
| `/mcp` | POST | MCP Streamable HTTP endpoint (stateless, auth required) |

## MCP Tools

| Tool | Description |
|------|-------------|
| `create_stash` | Create a new stash with files, tags, metadata. Returns confirmation only. |
| `read_stash` | Get stash metadata + file list with sizes. Optional `include_content` for full content. |
| `read_stash_file` | Read a specific file's content from a stash (most token-efficient). |
| `list_stashes` | List/search stashes with filters. Returns summaries with file sizes (no content). |
| `update_stash` | Update an existing stash. Returns confirmation only. |
| `delete_stash` | Delete a stash. |
| `search_stashes` | Full-text search across all stashes. Returns summaries with file sizes (no content). |
| `list_tags` | List all tags with usage counts. |
| `get_tag_graph` | Get tag relationship graph with optional focus tag, depth traversal, min_weight, min_count, limit filters. |
| `get_stats` | Get storage statistics. |
| `get_rest_api_spec` | Get the full OpenAPI 3.0 REST API specification (JSON). |
| `get_mcp_spec` | Get the full MCP specification (markdown with tool schemas and data types). |

### Token-Efficient MCP Data Flow

- `list_stashes`/`search_stashes` → summaries with file sizes (no content)
- `read_stash` → metadata + file list with sizes (no content by default)
- `read_stash_file` → selective single-file content access
- `read_stash(include_content=true)` → full content (only for small stashes)
- `create_stash`/`update_stash` → return confirmation summary, not echoed content

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3001` | No |
| `DATABASE_PATH` | Path to SQLite database file | `./data/clawstash.db` | No |
| `CORS_ORIGIN` | CORS allowed origin | `*` | No |
| `NODE_ENV` | Environment mode | `development` | No |
| `ADMIN_PASSWORD` | Admin password for login (unset = open access) | — | No |
| `ADMIN_SESSION_HOURS` | Admin session duration in hours (0 = unlimited) | `24` | No |

## Testing

**Currently no test framework is configured.** Recommended setup:

- **Framework**: Vitest (natural fit with Vite build system)
- **Priority areas for tests**: Database layer (`server/db.ts`), authentication (`server/auth.ts`), API routes (`server/routes/`)
- **CI integration**: The GitHub Actions workflow already supports conditional test execution (`npm test` or `npm run test:run`)

## Development Notes

- In development, Vite runs on port 3000 and proxies `/api/*` and `/mcp` to Express on port 3001
- In production, Express serves both the API and the built static frontend
- The SQLite database auto-creates in the `data/` directory on first run
- MCP is available as Streamable HTTP at `/mcp` (integrated in Express) and as stdio via `npm run mcp`
- Docker uses multi-stage build with Node 22-slim; requires python3/make/g++ for better-sqlite3 native addon compilation
- Docker volume maps to `/app/data` for database persistence
- CI/CD pipeline: type-check → (optional lint) → (optional test) → build → Docker push to GHCR

## Refactoring Notes

Refactoring does NOT happen automatically. Only upon explicit user request, when repeated code smells emerge across multiple files in review, or when a feature implementation is significantly harder than expected due to code structure. See `agent_docs/review_process.md` for principles.

- **`server/db.ts` (~610 lines)**: Largest file. Token/session management methods could be extracted into a separate `TokenStore` or `AuthStore` class. The `detectLanguage()` function could move to a shared utility.
- **`server/openapi.ts` (~560 lines)**: Large schema definition. Could adopt `@asteasolutions/zod-to-openapi` to generate from Zod schemas in `tool-defs.ts` (currently only MCP spec uses zodToJsonSchema; OpenAPI schemas are still hand-written).
- **`src/components/StashViewer.tsx` (~471 lines)**: Largest frontend component. File display, access log tab, and metadata display sections could be extracted into sub-components.
- **`src/components/Settings.tsx` (~444 lines)**: Could extract Welcome Dashboard and Storage Stats sections into dedicated sub-components within a `settings/` directory.
- **`src/languages.ts` (~334 lines)**: Extension map (65+ entries) and content-based detection heuristics are large but stable. Low priority.
- **No linter or test framework**: Adding ESLint + Vitest would significantly improve code quality assurance.
- **No Prettier config**: Adding Prettier would enforce consistent formatting.

## Documentation Rules

After every code change, check and update:

| File | Update when... |
|------|---------------|
| `CLAUDE.md` | New components, config files, patterns, or technical details |
| `README.md` | New features, API endpoints, environment variables for users |
| `BACKLOG.md` | Unresolved review findings (Accepted/Deferred) — see `agent_docs/backlog_process.md` |
| `.env.example` | New configuration options added |
