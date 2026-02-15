/**
 * Shared text constants used across OpenAPI spec, MCP spec, and frontend.
 * Single source of truth — edit here, all specs update automatically.
 */

export const CLAWSTASH_PURPOSE = `ClawStash is an AI-optimized stash system — a data vault for AI agents.

Instead of stuffing everything into static context, agents fetch information dynamically from ClawStash when they need it. Saves tokens, keeps context lean.

**We use it for:**
- 📝 **Thought storage** — capturing ideas, tagged by author
- 📋 **Project tracking** — todo lists, roadmap, current steps
- 📄 **Reference material** — API specs, prompts, docs that are only needed on-demand
- 🔗 **Graph relations** — tags show connections between stashes

**Not for:**
- 🔑 Secrets/passwords → use 1Password
- 💾 Code repositories → use GitHub
- 🧠 Operational agent memory → use MEMORY.md & daily notes
- 📁 Large binary files → text/code only

**Important:** ClawStash doesn't replace or compete with OpenClaw's internal mechanisms (Memory, Sessions, Config). It's a complement — an external data store that agents tap into when needed, like a reference book alongside their own memory.`;

/** Plain-text version (no markdown) for OpenAPI info.description and contexts that don't render markdown. */
export const CLAWSTASH_PURPOSE_PLAIN = `ClawStash — AI-optimized stash system — a data vault for AI agents. Instead of stuffing everything into static context, agents fetch information dynamically when needed. Saves tokens, keeps context lean. Use it for: thought storage (ideas tagged by author), project tracking (todos, roadmap, steps), reference material (API specs, prompts, docs on-demand), graph relations (tags show connections). NOT for: secrets/passwords (use 1Password), code repos (use GitHub), operational agent memory (use MEMORY.md & daily notes), or large binary files (text/code only). ClawStash complements but doesn't replace OpenClaw's internal mechanisms — it's an external data store agents tap into when needed.`;

/** Token-efficient usage guide shared between MCP server description and MCP spec output. */
export const TOKEN_EFFICIENT_GUIDE = `1. Use list_stashes or search_stashes to browse/find stashes (returns summaries only, no file content).
2. Use read_stash to get stash metadata and file list with sizes (no file content by default).
3. Use read_stash_file to selectively read only the files you need.
4. Only use read_stash with include_content=true when you need ALL files at once and the total size is small.
5. create_stash and update_stash return confirmations only (no echoed content) to save tokens.`;
