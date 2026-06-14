# Memory

Session-spanning project knowledge. **Read at session start, update during work.**

## Architecture Decisions

- **GitHub backup (#108, 2026-06-12)** — full rationale in ADR-0002. Key choices: OAuth **device flow** (user's own OAuth app, client ID only) + PAT fallback — user explicitly wanted "login via GitHub, then pick a repo"; NO admin SSO (separate issue if ever). Sync via **Git Data API over fetch** (no git binary, no new deps). One commit per changed stash, SHA-256 hash idempotence, last-writer-wins with 422 retry. Token AES-256-GCM at rest (`CLAWSTASH_ENCRYPTION_KEY` env or auto-generated `data/.clawstash-key`). Mutation events via `ClawStashDB.setMutationListener` (stdio MCP process has no listener — caught up by scheduled runs). Scheduler boots from `src/instrumentation.ts`.
- **Mermaid viewer zoom/pan/fullscreen (#100, 2026-04-26)** — chose `react-zoom-pan-pinch` over `panzoom` (anvaka) and `svg-pan-zoom`: React 19 compatible, native pinch + Ctrl/Cmd-modifier wheel zoom, programmatic API via wrapper ref (`zoomIn`/`zoomOut`/`setTransform`). Enhanced standalone `MermaidDiagram` component only; inline ` ```mermaid ` markdown blocks stay as static SVG (separate DOM hydration path; small diagrams in practice). Persistent zoom via `localStorage["clawstash_mermaid_zoom_${stash.id}:${filename}"]`. Initial render auto-fits to width unless a stored zoom exists.

## Gotchas & Pitfalls

- **Docker bind mounts vs. non-root image (2026-06-12)** — since #200 the image runs the server as `node` (uid 1000). Linux Docker auto-creates bind-mount sources (`./data`) root-owned, and DBs created by pre-#200 root images stay root-owned → SQLite opens them read-only (documented READWRITE fallback, no error at open) and the first write fails with `SQLITE_READONLY` — symptom: server looks healthy but admin login breaks. Fixed via root entrypoint (`docker-entrypoint.sh`: chown data dir, then `setpriv` drop to `node`) + fail-fast writability check in `ClawStashDB` (`db-access-check.ts`). Don't reintroduce a `USER node` directive in the Dockerfile — it would bypass the entrypoint's chown.
- **GitNexus skill files vs. Prettier (2026-06-12)** — GitNexus (re)writes `.claude/skills/gitnexus/*/SKILL.md` with its own Markdown table layout that fails `prettier --check`, causing recurring `format:check` failures in CI (a PostToolUse hook re-runs `analyze` after commits, so `--write` fixes never stick). Fix: `.claude/` is excluded in `.prettierignore` — do not remove that entry or re-format those files.
- **Inline Mermaid blank on full page load / F5 (#286, 2026-06-14)** — diagrams rendered fine via SPA nav but stayed blank on F5 / direct stash URL. **Root cause (confirmed via the user's DOM dump: placeholder empty, no marker, no console error):** the inline hydration _write was orphaned_. The effect rendered each ` ```mermaid ` placeholder and wrote its SVG, but the write was gated by a React-effect `cancelled` flag; a re-render during page boot cancelled the in-flight render and the write never landed (and never retried). **Fix:** extracted `hydrateMermaidPlaceholders(root)` into `src/utils/mermaid-hydrate.ts` — it claims each placeholder synchronously (`data-mermaid-rendered`) and writes the SVG when the render resolves, guarded **only** by `document.contains(el)`, never by a React lifecycle flag. Verified with jsdom tests that reproduce the boot-churn orphan scenario + the nested-`<table>` side-by-side case. **Two approaches that DON'T work (don't retry):** (a) the first patch — an async sequential loop that re-queries the DOM but still `return`s on `cancelled` — was merged (commit `1ef65ea`) and the user confirmed it did NOT fix it; (b) rendering inline blocks as React components portaled into the placeholder nodes — React re-creates a `dangerouslySetInnerHTML` subtree on every parent re-render, detaching the portal and remounting endlessly (proven in a test). Serialization of `renderMermaid` (`renderChain` in `mermaid.ts`) stays as defence against concurrent-render corruption of Mermaid's global state.

## Working Context

_(No entries yet)_

## Failed Approaches

_(No entries yet)_

## External Dependencies

- **@modelcontextprotocol/sdk v1.x + Zod 4** — MCP SDK v1 uses `zod-to-json-schema` which is incompatible with Zod v4. Blocks Zod upgrade until MCP SDK v2 ships. (2026-02-15)

## User Preferences

_(No entries yet)_
