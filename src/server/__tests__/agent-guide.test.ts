import { describe, it, expect, afterEach } from 'vitest';
import {
  formatLimitsMarkdown,
  getAgentEndpoints,
  getAgentLimits,
  getAgentSkillText,
  getLlmsTxt,
  getMcpInstructionsText,
  memoizeByBaseUrl,
} from '../agent-guide';
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_FILE_CONTENT_LENGTH,
  MAX_FILES,
  MAX_NAME_LENGTH,
  MAX_TAGS,
} from '../validation';
import { MAX_PAGE_LIMIT } from '../stores/_parsers';
import { DEFAULT_STASH_VERSION_LIMIT } from '../stores/version-store';
import { TOOL_DEFS } from '../tool-defs';

/**
 * The agent guide is what an agent reads INSTEAD of the code, so the numbers
 * and names in it have to be the ones the server enforces. These tests pin
 * that coupling: limits come from validation.ts, tool names from tool-defs.ts,
 * URLs from one endpoint map.
 */

const BASE = 'https://stash.example.com';

afterEach(() => {
  delete process.env.STASH_VERSION_LIMIT;
});

describe('getAgentLimits', () => {
  it('mirrors the validation constants and the paging clamp', () => {
    const l = getAgentLimits();
    expect(l.name_max_chars).toBe(MAX_NAME_LENGTH);
    expect(l.description_max_chars).toBe(MAX_DESCRIPTION_LENGTH);
    expect(l.tags_max).toBe(MAX_TAGS);
    expect(l.files_per_stash_max).toBe(MAX_FILES);
    expect(l.file_content_max_bytes).toBe(MAX_FILE_CONTENT_LENGTH);
    expect(l.page_limit_max).toBe(MAX_PAGE_LIMIT);
    expect(l.version_history_limit).toBe(DEFAULT_STASH_VERSION_LIMIT);
  });

  it('reads STASH_VERSION_LIMIT at call time', () => {
    process.env.STASH_VERSION_LIMIT = '0';
    expect(getAgentLimits().version_history_limit).toBe(0);
    expect(formatLimitsMarkdown()).toContain('unlimited');
  });

  it('renders the same numbers into the Markdown block', () => {
    const md = formatLimitsMarkdown();
    expect(md).toContain(`1–${MAX_FILES} per stash`);
    expect(md).toContain(`hard maximum ${MAX_PAGE_LIMIT} per page`);
    expect(md).toContain('10 MB per file');
  });
});

describe('getAgentSkillText', () => {
  const skill = getAgentSkillText(BASE);

  it('is an Agent Skills file: YAML frontmatter with name and description', () => {
    expect(skill.startsWith('---\nname: clawstash\ndescription: ')).toBe(true);
    const end = skill.indexOf('\n---\n', 4);
    expect(end).toBeGreaterThan(0);
    // The description must be a single line — multi-line frontmatter values
    // break the simple parsers most skill loaders use.
    const frontmatter = skill.slice(4, end);
    expect(frontmatter.split('\n')).toHaveLength(2);
  });

  it('names this instance, not a placeholder host', () => {
    expect(skill).toContain(`${BASE}/mcp`);
    expect(skill).toContain(`${BASE}/api/openapi`);
    expect(skill).not.toContain('localhost:3000');
  });

  it('mentions every MCP tool by name', () => {
    for (const t of TOOL_DEFS) {
      expect(skill, `tool ${t.name} missing from the skill`).toContain(`\`${t.name}\``);
    }
  });

  it('carries the sections an agent needs', () => {
    for (const heading of [
      '## When to use it',
      '## Connect',
      '## Workflow',
      '## Conventions',
      '## Limits',
      '## Errors',
      '## Maintenance',
    ]) {
      expect(skill).toContain(heading);
    }
    // The two rules agents get wrong most often are stated explicitly.
    expect(skill).toContain('replaced wholesale');
    expect(skill).toContain('never upgrade the instance on your own');
  });
});

describe('getMcpInstructionsText', () => {
  it('stays compact — it lives in the agent context for the whole session', () => {
    const text = getMcpInstructionsText(BASE);
    expect(text.length).toBeLessThan(2500);
    expect(text.split('\n').filter((l) => l.trim()).length).toBeLessThanOrEqual(12);
  });

  it('points at get_server_info first and at the skill URL', () => {
    const text = getMcpInstructionsText(BASE);
    expect(text).toContain('get_server_info');
    expect(text).toContain(`${BASE}/api/agent-skill`);
  });
});

describe('getLlmsTxt', () => {
  it('links every agent-facing document of the instance', () => {
    const txt = getLlmsTxt(BASE);
    const e = getAgentEndpoints(BASE);
    for (const url of [
      e.agent_skill,
      e.mcp_onboarding,
      e.mcp_spec,
      e.openapi,
      e.health,
      e.version,
      e.mcp,
    ]) {
      expect(txt).toContain(url);
    }
    expect(txt.startsWith('# ClawStash\n')).toBe(true);
  });
});

describe('memoizeByBaseUrl', () => {
  it('caches per baseUrl and rebuilds on change', () => {
    let calls = 0;
    const gen = memoizeByBaseUrl((b: string) => {
      calls++;
      return `built:${b}`;
    });
    expect(gen('a')).toBe('built:a');
    expect(gen('a')).toBe('built:a');
    expect(calls).toBe(1);
    expect(gen('b')).toBe('built:b');
    expect(calls).toBe(2);
  });
});
