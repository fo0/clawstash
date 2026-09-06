/**
 * Agent Guide — the operational text an AI agent needs to work with this
 * ClawStash instance well. Single source of truth for everything that is
 * repeated across the agent-facing surfaces:
 *
 * - MCP `instructions` handed to every client on `initialize` (mcp-server.ts)
 * - the SKILL.md served by `GET /api/agent-skill` (+ MCP resource)
 * - the onboarding guide `GET /api/mcp-onboarding` (mcp-spec.ts)
 * - the `get_server_info` MCP tool (limits + endpoints)
 * - `/llms.txt`
 *
 * Numbers are imported from validation.ts / the stores so the guide cannot
 * drift from what the server actually enforces. Prose lives here once; the
 * consumers only choose which blocks to include and in what framing.
 */
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_FILE_CONTENT_LENGTH,
  MAX_FILENAME_LENGTH,
  MAX_FILES,
  MAX_METADATA_DEPTH,
  MAX_METADATA_KEYS,
  MAX_NAME_LENGTH,
  MAX_TAG_LENGTH,
  MAX_TAGS,
} from './validation';
import { MAX_PAGE_LIMIT } from './stores/_parsers';
import { resolveStashVersionLimit } from './stores/version-store';

// ---------------------------------------------------------------------------
// Memoization helper (shared with mcp-spec.ts)
// ---------------------------------------------------------------------------

/**
 * Single-entry memoization keyed by baseUrl. Last-write-wins; the previous
 * entry is dropped when the key changes, so growth is bounded to one entry per
 * generator. Per-baseUrl variation is rare in practice (typically one host),
 * but the cache absorbs the repeated spec re-fetches an agent performs inside
 * a single baseUrl without leaking memory across hosts.
 */
export function memoizeByBaseUrl<T>(generator: (baseUrl: string) => T): (baseUrl: string) => T {
  let cache: { key: string; value: T } | null = null;
  return (baseUrl: string): T => {
    if (cache?.key === baseUrl) return cache.value;
    const value = generator(baseUrl);
    cache = { key: baseUrl, value };
    return value;
  };
}

// ---------------------------------------------------------------------------
// Limits — derived from the constants the server enforces
// ---------------------------------------------------------------------------

/** Default page size of list_stashes / GET /api/stashes (see db.listStashes). */
export const LIST_DEFAULT_LIMIT = 50;
/** Default page size of search_stashes / GET /api/stashes?search= (see search-store). */
export const SEARCH_DEFAULT_LIMIT = 20;

export interface AgentLimits {
  name_max_chars: number;
  description_max_chars: number;
  tags_max: number;
  tag_max_chars: number;
  metadata_max_keys: number;
  metadata_max_depth: number;
  files_per_stash_max: number;
  filename_max_chars: number;
  file_content_max_bytes: number;
  list_default_limit: number;
  search_default_limit: number;
  page_limit_max: number;
  /** Per-stash version history cap; 0 means unlimited. */
  version_history_limit: number;
}

/** Machine-readable limits, read at call time so `STASH_VERSION_LIMIT` is honoured. */
export function getAgentLimits(): AgentLimits {
  return {
    name_max_chars: MAX_NAME_LENGTH,
    description_max_chars: MAX_DESCRIPTION_LENGTH,
    tags_max: MAX_TAGS,
    tag_max_chars: MAX_TAG_LENGTH,
    metadata_max_keys: MAX_METADATA_KEYS,
    metadata_max_depth: MAX_METADATA_DEPTH,
    files_per_stash_max: MAX_FILES,
    filename_max_chars: MAX_FILENAME_LENGTH,
    file_content_max_bytes: MAX_FILE_CONTENT_LENGTH,
    list_default_limit: LIST_DEFAULT_LIMIT,
    search_default_limit: SEARCH_DEFAULT_LIMIT,
    page_limit_max: MAX_PAGE_LIMIT,
    version_history_limit: resolveStashVersionLimit(process.env.STASH_VERSION_LIMIT),
  };
}

function formatBytes(bytes: number): string {
  if (bytes % (1024 * 1024) === 0) return `${bytes / (1024 * 1024)} MB`;
  if (bytes % 1024 === 0) return `${bytes / 1024} KB`;
  return `${bytes} bytes`;
}

/** Limits as a Markdown bullet list — the same numbers `getAgentLimits()` returns. */
export function formatLimitsMarkdown(): string {
  const l = getAgentLimits();
  const history =
    l.version_history_limit === 0
      ? 'unlimited (`STASH_VERSION_LIMIT=0`)'
      : `${l.version_history_limit} snapshots per stash (oldest pruned on the next update; \`STASH_VERSION_LIMIT\`)`;
  return `- Stash: \`name\` ≤ ${l.name_max_chars} chars · \`description\` ≤ ${l.description_max_chars.toLocaleString('en-US')} chars · ${l.tags_max} tags × ${l.tag_max_chars} chars · metadata ≤ ${l.metadata_max_keys} keys, ${l.metadata_max_depth} levels deep
- Files: 1–${l.files_per_stash_max} per stash · filename ≤ ${l.filename_max_chars} chars, unique within the stash · content ≤ ${formatBytes(l.file_content_max_bytes)} per file, text only (no binaries)
- Paging: list default ${l.list_default_limit}, search default ${l.search_default_limit}, hard maximum ${l.page_limit_max} per page — use \`total\` to decide whether another page exists
- Version history: ${history}`;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export interface AgentEndpoints {
  mcp: string;
  rest_base: string;
  openapi: string;
  mcp_spec: string;
  mcp_onboarding: string;
  agent_skill: string;
  llms_txt: string;
  health: string;
  version: string;
  token_validate: string;
}

/** Every agent-relevant URL of this instance, absolute. */
export function getAgentEndpoints(baseUrl: string): AgentEndpoints {
  return {
    mcp: `${baseUrl}/mcp`,
    rest_base: `${baseUrl}/api`,
    openapi: `${baseUrl}/api/openapi`,
    mcp_spec: `${baseUrl}/api/mcp-spec`,
    mcp_onboarding: `${baseUrl}/api/mcp-onboarding`,
    agent_skill: `${baseUrl}/api/agent-skill`,
    llms_txt: `${baseUrl}/llms.txt`,
    health: `${baseUrl}/api/health`,
    version: `${baseUrl}/api/version`,
    token_validate: `${baseUrl}/api/tokens/validate`,
  };
}

// ---------------------------------------------------------------------------
// Shared prose blocks (Markdown)
// ---------------------------------------------------------------------------

/** One-line purpose, for headers and frontmatter. */
export const AGENT_PURPOSE_LINE =
  'ClawStash is persistent, searchable storage for AI agents: notes, configs, reference material and project history live here instead of in the context window, and come back via full-text search when needed.';

/** The decision rule: what belongs in a stash and what does not. */
export const AGENT_WHEN_TO_USE_MD = `**Store** information that must outlive the conversation or is too large to keep in context: background notes and ideas, project history (decisions, completed steps, old todo lists), reference material (specs, prompts, configs, snippets), anything the user may want to see in the web GUI.
**Do not store** secrets or credentials, whole code repositories, large binaries, or data you need in the next few turns anyway. Keep operational agent memory (MEMORY.md, daily notes) where it is — stash what should be findable later, not what drives the current turn.`;

/** The read/write workflow, phrased for MCP tools with the REST twins in brackets. */
export const AGENT_WORKFLOW_MD = `1. **Orient** — call \`get_server_info\` once per session (REST: \`GET /api/version\`, \`POST /api/tokens/validate\`): it returns your scopes, which tools you may call, the size limits and the instance's endpoints.
2. **Find before you create** — \`search_stashes\` (REST: \`GET /api/stashes?search=\`) is ranked full-text search over names, descriptions, tags, filenames and content; \`list_stashes\` + \`list_tags\` browse. Both return summaries with file sizes, never content.
3. **Inspect, then read selectively** — \`read_stash\` returns metadata and the file list with sizes; \`read_stash_file\` returns one file. Use \`read_stash(include_content=true)\` only when \`total_size\` is small (a few thousand characters).
4. **Store** — \`create_stash\` (REST: \`POST /api/stashes\`) with a descriptive name, a searchable description, 2–6 tags and meaningful filenames. The response is a confirmation with the new \`id\`, not an echo of the content.
5. **Change in place** — \`update_stash\` (REST: \`PATCH /api/stashes/{id}\`) changes only the fields you send, but \`files\`, \`tags\` and \`metadata\` are each replaced wholesale: read first, then send the complete list. Every update snapshots the previous state; history and restore are available over REST (\`/api/stashes/{id}/versions\`).
6. **Archive rather than delete** — \`archive_stash\` hides a stash from default listings while keeping it readable by ID; \`delete_stash\` is permanent.`;

/** Naming and tagging conventions so several agents (and the user) can find each other's stashes. */
export const AGENT_CONVENTIONS_MD = `- **name**: short and specific, the way a human would title a document ("Auth service — rollout plan"), no IDs or timestamps.
- **description**: 1–3 sentences saying what is inside, why it exists and when to read it again — this is what search ranks and what listings show.
- **tags**: lowercase kebab-case, 2–6 per stash. Reuse existing tags (\`list_tags\`) before inventing one; combine one project/topic tag with one type tag such as \`notes\`, \`config\`, \`reference\`, \`decision\`, \`todo\`, \`log\`.
- **metadata**: structured facts, not prose — e.g. \`{"agent": "openclaw", "project": "auth-service", "purpose": "handover", "source": "meeting 2026-09-01"}\`. Keys stay stable across stashes so they can be filtered later.
- **files**: real filenames with extensions (\`plan.md\`, \`docker-compose.yml\`) — the extension drives syntax highlighting and language stats. Prose goes in Markdown. One topic per stash; several related files in one stash beat several one-file stashes.
- **Say what you did**: after storing, tell the user the stash name and ID so they can open it in the GUI at \`/stash/{id}\`.`;

/** How failures surface and how to react. */
export const AGENT_ERRORS_MD = `- MCP tool failures are ordinary results with \`isError: true\` and a text that starts with \`Error:\` — read it, it names the cause (\`… not found\`, a validation message, or the missing scope).
- A scope error means your token lacks \`read\` or \`write\` for that tool; the \`mcp\` scope alone only opens the transport. Ask the operator for a token with \`read\`, \`write\` and \`mcp\` — do not retry the same call.
- REST: \`400\` carries \`{ "error": "<validation message>" }\`, \`401\` means no/invalid token (the \`WWW-Authenticate\` header says how to authenticate), \`403\` means insufficient scope, \`404\` unknown stash or file, \`429\` you hit the auth rate limit (honour \`Retry-After\`).
- \`update_stash\` with \`files\` replaces **all** files — a missing entry deletes that file. Include every file you want to keep.`;

/** Keeping the integration healthy over time. */
export function getAgentMaintenanceMd(baseUrl: string): string {
  const e = getAgentEndpoints(baseUrl);
  return `- **Check for updates** occasionally (e.g. weekly, or when the user asks) with \`check_version\` (REST: \`GET ${e.version}\`). If \`update_available\` is true, tell the user what changed (\`upgrade.compare_url\`) and offer the upgrade command from \`upgrade.instructions\` — never upgrade the instance on your own.
- **Refresh your tool knowledge** with \`refresh_tools\` only when a call fails with an unknown tool or argument, or right after the instance was upgraded — it returns the full specification, so calling it routinely wastes tokens.
- **Re-read this guide** at \`${e.agent_skill}\` after an upgrade; the full onboarding document lives at \`${e.mcp_onboarding}\`, the machine-readable REST contract at \`${e.openapi}\`.`;
}

// ---------------------------------------------------------------------------
// MCP `instructions` — handed to every client on initialize. Compact on purpose:
// this text lands in the agent's system prompt for the whole session.
// ---------------------------------------------------------------------------

export const getMcpInstructionsText = memoizeByBaseUrl((baseUrl: string): string => {
  const e = getAgentEndpoints(baseUrl);
  return `${AGENT_PURPOSE_LINE}

Start with get_server_info: it returns your scopes, the tools you may call, size limits and endpoints.

Workflow: search_stashes / list_stashes find (summaries only) → read_stash inspects (file list + sizes) → read_stash_file reads one file → create_stash stores → update_stash changes in place (files/tags/metadata are replaced wholesale — read first, send the full list) → archive_stash instead of delete_stash when unsure.

Conventions: specific human-readable name; 1–3 sentence searchable description; 2–6 lowercase kebab-case tags, reuse existing ones (list_tags); metadata = structured facts (agent, project, purpose); real filenames with extensions; one topic per stash; tell the user the stash name and ID after storing.

Errors come back as results with isError: true and a text starting "Error:" — a scope error means the token lacks read/write (mcp alone only opens the transport); ask for a token with read, write and mcp instead of retrying. Call refresh_tools only after a failed call or an upgrade, not routinely. check_version reports updates; suggest the upgrade to the user, never perform it.

Full guide (SKILL.md): ${e.agent_skill} · onboarding: ${e.mcp_onboarding} · REST contract: ${e.openapi}`;
});

// ---------------------------------------------------------------------------
// SKILL.md — Agent Skills format (YAML frontmatter + Markdown body)
// ---------------------------------------------------------------------------

export const getAgentSkillText = memoizeByBaseUrl((baseUrl: string): string => {
  const e = getAgentEndpoints(baseUrl);
  return `---
name: clawstash
description: Persistent storage for AI agents at ${baseUrl} — store notes, configs, reference material and project history outside the context window and retrieve them via MCP or REST with ranked full-text search. Use when information should outlive the conversation, is too large to keep in context, or the user should be able to see it in the ClawStash web GUI.
---

# ClawStash

${AGENT_PURPOSE_LINE}

This instance: MCP endpoint \`${e.mcp}\` (Streamable HTTP, \`Authorization: Bearer <token>\`), REST base \`${e.rest_base}\`. Save this file as \`skills/clawstash/SKILL.md\` (or wherever your agent loads skills from) and re-fetch it from \`${e.agent_skill}\` after the instance is upgraded.

## When to use it

${AGENT_WHEN_TO_USE_MD}

## Connect

- **MCP (preferred):** \`{"mcpServers":{"clawstash":{"type":"streamable-http","url":"${e.mcp}","headers":{"Authorization":"Bearer <token>"}}}}\`. The token needs the scopes \`read\`, \`write\` and \`mcp\` — \`mcp\` alone only opens the transport.
- **REST:** every request carries \`Authorization: Bearer <token>\`; \`POST ${e.token_validate}\` tells you whether a token is valid and which scopes it has. The OpenAPI 3.0 contract is at \`${e.openapi}\`.
- **No token?** Ask the operator to create one under **Settings → API & Tokens** in the web GUI. When the instance runs without \`ADMIN_PASSWORD\`, no token is required at all.

## Workflow

${AGENT_WORKFLOW_MD}

## MCP tools ↔ REST endpoints

| Goal                 | MCP tool                          | REST                                                         |
| -------------------- | --------------------------------- | ------------------------------------------------------------ |
| Orient               | \`get_server_info\`                 | \`GET /api/version\`, \`POST /api/tokens/validate\`              |
| Find                 | \`search_stashes\`                  | \`GET /api/stashes?search=&tag=&archived=&page=&limit=\`       |
| Browse               | \`list_stashes\`, \`list_tags\`       | \`GET /api/stashes\`, \`GET /api/stashes/tags\`                  |
| Inspect              | \`read_stash\`                      | \`GET /api/stashes/{id}\` (returns all file content)           |
| Read one file        | \`read_stash_file\`                 | \`GET /api/stashes/{id}/files/{filename}/raw\`                 |
| Store                | \`create_stash\`                    | \`POST /api/stashes\`                                          |
| Change               | \`update_stash\`                    | \`PATCH /api/stashes/{id}\`                                    |
| Archive / unarchive  | \`archive_stash\`                   | \`PATCH /api/stashes/{id}\` with \`{"archived": true}\`          |
| Delete               | \`delete_stash\`                    | \`DELETE /api/stashes/{id}\`                                   |
| History / restore    | — (REST only)                     | \`GET /api/stashes/{id}/versions\`, \`POST …/versions/{v}/restore\` |
| Tag relationships    | \`get_tag_graph\`                   | \`GET /api/stashes/graph\`                                     |
| Statistics           | \`get_stats\`                       | \`GET /api/stashes/stats\`                                     |
| Updates              | \`check_version\`                   | \`GET /api/version\`                                           |
| Tool reference       | \`refresh_tools\`, \`get_mcp_spec\`   | \`GET /api/mcp-onboarding\`, \`GET /api/mcp-spec\`               |
| REST contract        | \`get_rest_api_spec\`               | \`GET /api/openapi\`                                           |

## Conventions

${AGENT_CONVENTIONS_MD}

## Limits

${formatLimitsMarkdown()}

## Errors

${AGENT_ERRORS_MD}

## Maintenance

${getAgentMaintenanceMd(baseUrl)}
`;
});

// ---------------------------------------------------------------------------
// /llms.txt — discovery index (https://llmstxt.org)
// ---------------------------------------------------------------------------

export const getLlmsTxt = memoizeByBaseUrl((baseUrl: string): string => {
  const e = getAgentEndpoints(baseUrl);
  return `# ClawStash

> ${AGENT_PURPOSE_LINE}

MCP endpoint: ${e.mcp} (Streamable HTTP, Bearer token with the scopes read, write and mcp). REST base: ${e.rest_base}.

## Agent guides

- [Skill (SKILL.md)](${e.agent_skill}): compact operational guide — when to store, workflow, conventions, limits, errors, maintenance
- [MCP onboarding](${e.mcp_onboarding}): the skill plus the complete MCP specification with every tool's JSON Schema
- [MCP specification](${e.mcp_spec}): tool definitions, input schemas, return types, data types
- [OpenAPI 3.0](${e.openapi}): the REST contract, machine-readable

## Status

- [Health](${e.health}): liveness (always 200 when the database is reachable)
- [Version](${e.version}): running build, whether an update is available, upgrade instructions
`;
});
