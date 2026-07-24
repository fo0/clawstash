import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildMcpStdioConfig,
  buildMcpStreamableConfig,
  MCP_STDIO_ENTRY,
  MCP_STDIO_CWD_PLACEHOLDER,
  getRestConfigText,
} from '../api-data';

describe('buildMcpStdioConfig', () => {
  // Regression: the copied snippet once pointed at `server/mcp.ts` (the file
  // lives under `src/server/mcp.ts`), so every copy-pasted client config
  // failed with "Cannot find module".
  it('points at a stdio entry file that actually exists in the repo', () => {
    expect(existsSync(resolve(process.cwd(), MCP_STDIO_ENTRY))).toBe(true);
  });

  it('stays in sync with the package.json `mcp` script', () => {
    const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.mcp).toContain(MCP_STDIO_ENTRY);
  });

  it('uses the placeholder cwd the UI tells users to replace', () => {
    const config = buildMcpStdioConfig();
    expect(config.mcpServers.clawstash.args).toEqual(['tsx', MCP_STDIO_ENTRY]);
    expect(config.mcpServers.clawstash.cwd).toBe(MCP_STDIO_CWD_PLACEHOLDER);
  });
});

describe('buildMcpStreamableConfig', () => {
  it('targets the /mcp endpoint of the given base URL', () => {
    const config = buildMcpStreamableConfig('https://stash.example');
    expect(config.mcpServers.clawstash.url).toBe('https://stash.example/mcp');
  });
});

describe('getRestConfigText', () => {
  it('derives the endpoint summary from the OpenAPI JSON', () => {
    const spec = JSON.stringify({
      paths: { '/api/stashes': { get: { summary: 'List stashes', tags: ['Stashes'] } } },
    });
    const text = getRestConfigText('https://stash.example', spec);
    expect(text).toContain('## Endpoints');
    expect(text).toContain('GET    https://stash.example/api/stashes');
    expect(text).toContain('## OpenAPI 3.0 Specification');
  });

  it('omits endpoint and schema sections when no OpenAPI JSON is available', () => {
    const text = getRestConfigText('https://stash.example');
    expect(text).toContain('## Base URL');
    expect(text).not.toContain('## Endpoints');
    expect(text).not.toContain('## OpenAPI 3.0 Specification');
  });
});
