/**
 * Shared text constants used across OpenAPI spec, MCP spec, and frontend.
 * Single source of truth — edit here, all specs update automatically.
 */

export const CLAWSTASH_PURPOSE = `ClawStash is an AI-optimized offloading system — a data vault where AI agents store information that's NOT currently needed in active conversation.

**When agents use ClawStash:**
The agent decides to offload data when:
- ❌ **Not needed for current conversation** — information that's not immediately relevant
- 📏 **Too large for context** — data that would consume too many tokens
- ⏳ **Won't be accessed soon** — likely not needed in the near future
- 💾 **Better organized externally** — clearer structure, better user visibility

**We use it for:**
- 📝 **Background thought storage** — ideas and notes that don't need to be in active context
- 📋 **Historical project tracking** — past todo lists, completed roadmap steps, archived decisions
- 📄 **Reference material** — API specs, prompts, docs retrieved only on-demand
- 🔗 **Graph relations** — tags show connections between stored information

**NOT for:**
- 💬 **Active conversation data** — keep in context if needed NOW
- 🔑 Secrets/passwords → use 1Password
- 💾 Code repositories → use GitHub
- 🧠 Operational agent memory → use MEMORY.md & daily notes
- 📁 Large binary files → text/code only

**Purpose:** Save context tokens, better organize data, and better inform users by offloading information that's not immediately relevant to the current conversation.`;

/** Plain-text version (no markdown) for OpenAPI info.description and contexts that don't render markdown. */
export const CLAWSTASH_PURPOSE_PLAIN = `ClawStash — AI-optimized offloading system — a data vault where AI agents store information that's NOT currently needed in active conversation. Agents decide to offload when: not needed for current conversation, too large for context, won't be accessed soon, better organized externally. Use it for: background thought storage (ideas not in active context), historical project tracking (past todos, completed steps), reference material (API specs, prompts, docs on-demand), graph relations (tags show connections). NOT for: active conversation data (keep in context if needed NOW), secrets/passwords (use 1Password), code repos (use GitHub), operational agent memory (use MEMORY.md & daily notes), or large binary files (text/code only). Purpose: save context tokens, better organize data, better inform users by offloading information not immediately relevant.`;

/** Token-efficient usage guide shared between MCP server description and MCP spec output. */
export const TOKEN_EFFICIENT_GUIDE = `1. Use list_stashes or search_stashes to browse/find stashes (returns summaries only, no file content).
2. Use read_stash to get stash metadata and file list with sizes (no file content by default).
3. Use read_stash_file to selectively read only the files you need.
4. Only use read_stash with include_content=true when you need ALL files at once and the total size is small.
5. create_stash and update_stash return confirmations only (no echoed content) to save tokens.`;
