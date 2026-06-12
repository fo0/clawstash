# Memory

Session-spanning project knowledge. **Read at session start, update during work.**

## Architecture Decisions

- **Mermaid viewer zoom/pan/fullscreen (#100, 2026-04-26)** — chose `react-zoom-pan-pinch` over `panzoom` (anvaka) and `svg-pan-zoom`: React 19 compatible, native pinch + Ctrl/Cmd-modifier wheel zoom, programmatic API via wrapper ref (`zoomIn`/`zoomOut`/`setTransform`). Enhanced standalone `MermaidDiagram` component only; inline ` ```mermaid ` markdown blocks stay as static SVG (separate DOM hydration path; small diagrams in practice). Persistent zoom via `localStorage["clawstash_mermaid_zoom_${stash.id}:${filename}"]`. Initial render auto-fits to width unless a stored zoom exists.

## Gotchas & Pitfalls

- **Docker bind mounts vs. non-root image (2026-06-12)** — since #200 the image runs the server as `node` (uid 1000). Linux Docker auto-creates bind-mount sources (`./data`) root-owned, and DBs created by pre-#200 root images stay root-owned → SQLite opens them read-only (documented READWRITE fallback, no error at open) and the first write fails with `SQLITE_READONLY` — symptom: server looks healthy but admin login breaks. Fixed via root entrypoint (`docker-entrypoint.sh`: chown data dir, then `setpriv` drop to `node`) + fail-fast writability check in `ClawStashDB` (`db-access-check.ts`). Don't reintroduce a `USER node` directive in the Dockerfile — it would bypass the entrypoint's chown.
- **GitNexus skill files vs. Prettier (2026-06-12)** — GitNexus (re)writes `.claude/skills/gitnexus/*/SKILL.md` with its own Markdown table layout that fails `prettier --check`, causing recurring `format:check` failures in CI (a PostToolUse hook re-runs `analyze` after commits, so `--write` fixes never stick). Fix: `.claude/` is excluded in `.prettierignore` — do not remove that entry or re-format those files.

## Working Context

_(No entries yet)_

## Failed Approaches

_(No entries yet)_

## External Dependencies

- **@modelcontextprotocol/sdk v1.x + Zod 4** — MCP SDK v1 uses `zod-to-json-schema` which is incompatible with Zod v4. Blocks Zod upgrade until MCP SDK v2 ships. (2026-02-15)

## User Preferences

_(No entries yet)_
