# Project Structure

Extracted from `CLAUDE.md` (size budget 40k chars). Update this file when files are added, moved, or removed.

````
clawstash/
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript config (strict, ES2022, Next.js plugin, @/* path alias)
├── next.config.ts              # Next.js config (standalone output, better-sqlite3 external)
├── Dockerfile                  # Multi-stage Docker build (Node 26-slim, Next.js standalone)
├── docker-compose.yml          # Docker Compose deployment
├── .env.example                # Environment variables template
├── BACKLOG.md                  # Deferred review findings tracker
├── MEMORY.md                   # Session-spanning project knowledge (long-term)
├── SCRATCHPAD.md               # Temporary working context (short-term)
├── agent_docs/                 # Agent process documentation
│   ├── review_process.md       # Mandatory review process after every implementation
│   ├── backlog_process.md      # Backlog tracking rules and format
│   ├── memory_process.md       # Memory tracking rules and format
│   ├── refactoring_guidelines.md  # Refactoring principles and rules
│   ├── diagram_prompt.md       # Architecture diagram generation instructions
│   └── project-structure.md    # This file
├── docs/                       # User-facing documentation (split from README)
│   ├── api-reference.md        # REST API endpoints, examples, query parameters
│   ├── mcp.md                  # MCP tools, token-efficient patterns, transport options
│   ├── deployment.md           # Docker, production, CI/CD, GHCR setup
│   ├── authentication.md       # Admin login, API tokens, scopes, security
│   └── openclaw-onboarding-prompt.md  # Copy-paste onboarding prompt for OpenClaw agents
├── .claude/
│   └── skills/
│       └── gitnexus/           # GitNexus code intelligence skills (explore, debug, refactor, review, impact, query)
├── .github/
│   └── workflows/
│       └── docker-publish.yml  # CI: Type-check, build, push to GHCR
├── scripts/
│   └── generate-build-info.js  # Prebuild script: generates build metadata (git branch, commit, date)
├── public/                     # Next.js static assets
├── src/
│   ├── middleware.ts            # Next.js middleware (CORS, security headers)
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # Root layout with metadata + global CSS
│   │   ├── page.tsx            # Client component wrapper for <App />
│   │   ├── [...slug]/
│   │   │   └── page.tsx        # Catch-all route for client-side routing
│   │   ├── mcp/
│   │   │   └── route.ts        # MCP Streamable HTTP endpoint (POST/GET/DELETE)
│   │   └── api/                # API Route Handlers
│   │       ├── _helpers.ts     # Shared utilities (checkScope, checkAdmin, getBaseUrl)
│   │       ├── health/route.ts # GET health check (no auth, DB status + stats)
│   │       ├── stashes/
│   │       │   ├── route.ts            # GET (list), POST (create)
│   │       │   ├── stats/route.ts      # GET storage statistics
│   │       │   ├── tags/route.ts       # GET all tags with counts
│   │       │   ├── metadata-keys/route.ts  # GET unique metadata keys
│   │       │   ├── graph/route.ts      # GET tag relationship graph
│   │       │   ├── graph/stashes/route.ts  # GET stash relationship graph
│   │       │   └── [id]/
│   │       │       ├── route.ts        # GET, PATCH, DELETE single stash
│   │       │       ├── access-log/route.ts  # GET access log
│   │       │       ├── files/[filename]/raw/route.ts  # GET raw file content
│   │       │       └── versions/
│   │       │           ├── route.ts    # GET version list
│   │       │           ├── diff/route.ts  # GET version diff
│   │       │           └── [version]/
│   │       │               ├── route.ts       # GET specific version
│   │       │               └── restore/route.ts  # POST restore version
│   │       ├── tokens/
│   │       │   ├── route.ts            # GET (list), POST (create)
│   │       │   ├── [id]/route.ts       # DELETE
│   │       │   └── validate/route.ts   # POST validate token (per-IP rate-limited)
│   │       ├── admin/
│   │       │   ├── auth/route.ts       # POST login (per-IP rate-limited)
│   │       │   ├── logout/route.ts     # POST logout
│   │       │   ├── session/route.ts    # GET session status (per-IP rate-limited when token supplied)
│   │       │   ├── export/route.ts     # GET ZIP download
│   │       │   └── import/route.ts     # POST ZIP upload
│   │       ├── openapi/route.ts        # GET OpenAPI schema
│   │       ├── version/route.ts        # GET version info
│   │       ├── mcp-spec/route.ts       # GET MCP specification
│   │       ├── mcp-onboarding/route.ts # GET MCP onboarding guide
│   │       └── mcp-tools/route.ts      # GET MCP tool summaries
│   ├── server/                 # Server-side logic (used by API route handlers)
│   │   ├── db.ts               # SQLite database layer (ClawStashDB class)
│   │   ├── db-schema.ts        # SQLite table / index definitions
│   │   ├── db-migrations.ts    # Schema migrations runner
│   │   ├── db-types.ts         # Shared DB row / domain types
│   │   ├── singleton.ts        # DB singleton with globalThis for HMR protection
│   │   ├── auth.ts             # Auth utility (token extraction, validation, scope checking)
│   │   ├── auth-rate-limit.ts  # In-memory per-IP rate limiter (login, token-validate, session)
│   │   ├── detect-language.ts  # Filename → language tag (server persistence)
│   │   ├── shared-text.ts      # Shared text constants (PURPOSE, TOKEN_EFFICIENT_GUIDE)
│   │   ├── tool-defs.ts        # MCP tool definitions (Zod schemas + descriptions)
│   │   ├── mcp-server.ts       # MCP server factory (imports tool-defs.ts, defines handlers)
│   │   ├── mcp-spec.ts         # MCP spec generator (zodToJsonSchema + OpenAPI data types)
│   │   ├── mcp.ts              # MCP server stdio transport entry point
│   │   ├── openapi.ts          # OpenAPI 3.0 schema generator
│   │   ├── validation.ts       # Zod schemas for API input validation + size limits
│   │   ├── version.ts          # Version check utility (build info + GitHub latest commit)
│   │   ├── stores/             # Persistence stores split out from db.ts
│   │   │   ├── _token-hash.ts  # Shared token hashing helper
│   │   │   ├── session-store.ts # Admin session CRUD
│   │   │   ├── token-store.ts  # API token CRUD
│   │   │   └── __tests__/      # Store unit tests (vitest)
│   │   └── __tests__/          # Server unit tests (vitest, e.g. mcp-spec)
│   ├── App.tsx                 # Main app component, state management
│   ├── api.ts                  # API client (fetch wrapper)
│   ├── types.ts                # Shared TypeScript interfaces
│   ├── languages.ts            # PrismJS language detection, mapping, highlighting
│   ├── hooks/
│   │   ├── useClipboard.ts     # useClipboard + useClipboardWithKey hooks
│   │   └── useClickOutside.ts  # Click-outside detection hook (used by Sidebar, TagCombobox, MetadataEditor)
│   ├── utils/
│   │   ├── clipboard.ts        # Copy-to-clipboard with fallback for non-HTTPS
│   │   ├── constants.ts        # Shared client/server constants
│   │   ├── favorites.ts        # Favorite-stash localStorage helpers
│   │   ├── format.ts           # Date formatting (formatDate, formatDateTime, formatRelativeTime)
│   │   ├── html.ts             # HTML sanitization helpers
│   │   ├── markdown.ts         # Markdown rendering for descriptions (Marked + sanitization)
│   │   ├── mermaid.ts          # Lazy-loaded Mermaid renderer (shared util for .mmd files + inline ```mermaid blocks)
│   │   └── __tests__/          # Util unit tests (vitest: favorites, format, html)
│   ├── components/
│   │   ├── Sidebar.tsx         # Left sidebar with search, tag filter, stash list, settings nav
│   │   ├── Footer.tsx          # App footer with version (fetched from /api/version), build info toggle
│   │   ├── Dashboard.tsx       # Home view with grid/list of stash cards
│   │   ├── GraphViewer.tsx     # Force-directed tag graph visualization (canvas-based)
│   │   ├── StashCard.tsx       # Individual stash card component
│   │   ├── StashViewer.tsx     # Stash detail view with file display, TOC, access log, version history
│   │   ├── StashGraphCanvas.tsx # Stash graph canvas component
│   │   ├── VersionHistory.tsx  # Version history list, Confluence-style inline comparison radios, restore button
│   │   ├── VersionDiff.tsx     # GitHub-style diff view (green/red) using jsdiff
│   │   ├── version-diff-utils.ts # Pure diff utilities extracted from VersionDiff (unit-tested)
│   │   ├── __tests__/          # Component unit tests (vitest: version-diff-utils)
│   │   ├── SearchOverlay.tsx   # Alt+K quick search overlay with keyboard navigation
│   │   ├── LoginScreen.tsx     # Password login gate
│   │   ├── MermaidDiagram.tsx  # React wrapper around renderMermaid() for .mmd files
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
│   │   │   ├── api-data.ts    # Static data: endpoints, tools, scope labels, spec generators
│   │   │   ├── icons.tsx       # API-specific icons
│   │   │   └── useCopyToast.ts # Copy toast hook
│   │   └── editor/             # Stash editor sub-components
│   │       ├── StashEditor.tsx # Main create/edit form with file management
│   │       ├── FileCodeEditor.tsx # PrismJS code editor wrapper
│   │       ├── TagCombobox.tsx # Tag input with autocomplete dropdown
│   │       └── MetadataEditor.tsx # Key-value editor with suggestions
│   └── styles/
│       └── app.css             # Global styles (CSS custom properties)
└── data/                       # SQLite database directory (gitignored)
````
