/**
 * Shared text constants used across OpenAPI spec, MCP spec, and frontend.
 * Single source of truth — edit here, all specs update automatically.
 */

export const CLAWSTASH_PURPOSE = `ClawStash is an AI-optimized stash storage system — dynamic RAG instead of static context.

A data/documentation vault for everything that doesn't fit in .md files: too large, too much, structured data, reference material.

**Use cases:**
- **Reference Material** — API specs, docs, guides retrieved on demand instead of always loaded in context
- **Project Snapshots** — Code, configs, logs stored without cluttering the workspace
- **Structured Data** — Lists, tables, datasets that don't work well in Markdown
- **Shared Information** — Data exchanged between different tools and agents

**Core principle:** Instead of stuffing everything into static context (MEMORY.md, TOOLS.md etc.), retrieve information dynamically from ClawStash when needed. Saves tokens and keeps context lean.`;

/** Plain-text version (no markdown) for OpenAPI info.description and contexts that don't render markdown. */
export const CLAWSTASH_PURPOSE_PLAIN = `ClawStash — AI-optimized stash storage system — dynamic RAG instead of static context. A data/documentation vault for everything that doesn't fit in .md files: API specs, project snapshots, structured data, shared information between tools and agents. Retrieve information dynamically when needed instead of keeping everything in static context. Saves tokens and keeps context lean. Features: Text and file storage with name, description, tags, metadata. REST API + MCP Server + Web UI. Full-text search. Token-based authentication.`;

/** Token-efficient usage guide shared between MCP server description and MCP spec output. */
export const TOKEN_EFFICIENT_GUIDE = `1. Use list_stashes or search_stashes to browse/find stashes (returns summaries only, no file content).
2. Use read_stash to get stash metadata and file list with sizes (no file content by default).
3. Use read_stash_file to selectively read only the files you need.
4. Only use read_stash with include_content=true when you need ALL files at once and the total size is small.
5. create_stash and update_stash return confirmations only (no echoed content) to save tokens.`;
