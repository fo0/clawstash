# Memory

Session-spanning project knowledge. **Read at session start, update during work.**

## Architecture Decisions

- **GitHub backup (#108, 2026-06-12)** — full rationale in ADR-0002. Key choices: OAuth **device flow** (user's own OAuth app, client ID only) + PAT fallback — user explicitly wanted "login via GitHub, then pick a repo"; NO admin SSO (separate issue if ever). Sync via **Git Data API over fetch** (no git binary, no new deps). One commit per changed stash, SHA-256 hash idempotence, last-writer-wins with 422 retry. Token AES-256-GCM at rest (`CLAWSTASH_ENCRYPTION_KEY` env or auto-generated `data/.clawstash-key`). Mutation events via `ClawStashDB.setMutationListener` (stdio MCP process has no listener — caught up by scheduled runs). Scheduler boots from `src/instrumentation.ts`.
- **Mermaid viewer zoom/pan/fullscreen (#100, 2026-04-26)** — chose `react-zoom-pan-pinch` over `panzoom` (anvaka) and `svg-pan-zoom`: React 19 compatible, native pinch + Ctrl/Cmd-modifier wheel zoom, programmatic API via wrapper ref (`zoomIn`/`zoomOut`/`setTransform`). Enhanced standalone `MermaidDiagram` component only; inline ` ```mermaid ` markdown blocks stay as static SVG (separate DOM hydration path; small diagrams in practice). Persistent zoom via `localStorage["clawstash_mermaid_zoom_${stash.id}:${filename}"]`. Initial render auto-fits to width unless a stored zoom exists.

## Gotchas & Pitfalls

- **Global hotkeys vs. overlays/popups (2026-07-18)** — `App.tsx` registers window-level single-key hotkeys (`n`, `e`, `a`, `/`, `?`, Escape→home). Any overlay/popup that consumes Escape via its own `document`/`window` listener MUST also stop the event from reaching App's handler, or Escape closes the overlay AND navigates away (was live in SearchOverlay, KeyboardShortcutsHelp, both graph popups). Current contract: App's hotkey handler early-returns while `modalOpenRef` says a modal is open; overlays additionally `stopPropagation()` (document listeners) or register capture-phase window listeners (graph popups, which only consume when something is open so a second Escape still exits the view). New overlays must follow the same pattern. Editor data loss is guarded via `editorDirtyRef` (set through StashEditor's `onDirtyChange`) — every in-app nav path out of the editor calls `confirmDiscardUnsaved()`; browser-back/popstate is NOT guarded (BACKLOG #128).

- **Docker bind mounts vs. non-root image (2026-06-12)** — since #200 the image runs the server as `node` (uid 1000). Linux Docker auto-creates bind-mount sources (`./data`) root-owned, and DBs created by pre-#200 root images stay root-owned → SQLite opens them read-only (documented READWRITE fallback, no error at open) and the first write fails with `SQLITE_READONLY` — symptom: server looks healthy but admin login breaks. Fixed via root entrypoint (`docker-entrypoint.sh`: chown data dir, then `setpriv` drop to `node`) + fail-fast writability check in `ClawStashDB` (`db-access-check.ts`). Don't reintroduce a `USER node` directive in the Dockerfile — it would bypass the entrypoint's chown.
- **GitNexus skill files vs. Prettier (2026-06-12)** — GitNexus (re)writes `.claude/skills/gitnexus/*/SKILL.md` with its own Markdown table layout that fails `prettier --check`, causing recurring `format:check` failures in CI (a PostToolUse hook re-runs `analyze` after commits, so `--write` fixes never stick). Fix: `.claude/` is excluded in `.prettierignore` — do not remove that entry or re-format those files.
- **Inline Mermaid blank on full page load / F5 (#286, 2026-06-14)** — diagrams rendered fine via SPA nav but stayed blank on F5 / direct stash URL. **ACTUAL root cause (finally confirmed with a real headless-browser repro — puppeteer + the standalone prod build):** StashViewer re-renders many times during page boot (sidebar list resolves, admin-session check resolves, …). React **re-applies the markdown blob's `dangerouslySetInnerHTML` on each of those re-renders**, tearing down and recreating the `.mermaid-placeholder` nodes (and any SVG already hydrated into them). The placeholders churned ~4× on F5; the last re-apply landed _after_ the hydration effect had run, so the final placeholders were never hydrated → blank. On SPA nav the app is idle (no re-render storm) so the single hydration stuck. The blob string is byte-stable, yet React still re-applied it — so the win is to stop those re-renders from reaching the blob. **Fix:** wrap the blob in `React.memo` (`src/components/MarkdownBody.tsx`) keyed on the HTML string → applied once, placeholders survive, hydration sticks. **Do NOT remove that memo.** Verified end-to-end in a real browser (direct load + F5 ×2 + nav all render 2/2) and guarded by a jsdom memo regression test (`MarkdownBody.test.tsx`).
  - The orphan-proof hydration helper `hydrateMermaidPlaceholders` (`src/utils/mermaid-hydrate.ts`, claims nodes synchronously, write guarded only by `document.contains`) and the `renderMermaid` serialization (`renderChain`) stay — both correct and complementary — but neither was the real cause; the **re-render churn was**. Earlier wrong theories (don't revisit): "orphaned write gated by `cancelled`" (shipped in #287/#288, did NOT fix it); and React-portals into the placeholder nodes (React re-creates the `dangerouslySetInnerHTML` subtree → portal detaches; proven in a test).
  - Debugging lesson: this took 3 tries because I reasoned instead of reproducing. A `dangerouslySetInnerHTML` blob that React re-applies under a re-render storm is invisible to pure reasoning — the headless-browser MutationObserver on `.mermaid-placeholder` add/remove was what exposed it. Reproduce timing/lifecycle bugs in a real browser before theorising.

## Working Context

_(No entries yet)_

## Failed Approaches

_(No entries yet)_

## External Dependencies

- **@modelcontextprotocol/sdk v1.x + Zod 4** — MCP SDK v1 uses `zod-to-json-schema` which is incompatible with Zod v4. Blocks Zod upgrade until MCP SDK v2 ships. (2026-02-15)

## User Preferences

_(No entries yet)_
