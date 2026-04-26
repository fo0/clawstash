# Memory

Session-spanning project knowledge. **Read at session start, update during work.**

## Architecture Decisions

- **Mermaid viewer zoom/pan/fullscreen (#100, 2026-04-26)** — chose `react-zoom-pan-pinch` over `panzoom` (anvaka) and `svg-pan-zoom`: React 19 compatible, native pinch + Ctrl/Cmd-modifier wheel zoom, programmatic API via wrapper ref (`zoomIn`/`zoomOut`/`setTransform`). Enhanced standalone `MermaidDiagram` component only; inline ` ```mermaid ` markdown blocks stay as static SVG (separate DOM hydration path; small diagrams in practice). Persistent zoom via `localStorage["clawstash_mermaid_zoom_${stash.id}:${filename}"]`. Initial render auto-fits to width unless a stored zoom exists.

## Gotchas & Pitfalls

_(No entries yet)_

## Working Context

_(No entries yet)_

## Failed Approaches

_(No entries yet)_

## External Dependencies

- **@modelcontextprotocol/sdk v1.x + Zod 4** — MCP SDK v1 uses `zod-to-json-schema` which is incompatible with Zod v4. Blocks Zod upgrade until MCP SDK v2 ships. (2026-02-15)

## User Preferences

_(No entries yet)_
