import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ClawStashDB } from '../db';
import type { TokenScope } from '../db';
import { createMcpServer } from '../mcp-server';
import { getAgentSkillText } from '../agent-guide';
import { getMcpOnboardingText } from '../mcp-spec';
import { TOOL_DEFS } from '../tool-defs';

/**
 * Agent onboarding over MCP: the `instructions` handed out on initialize, the
 * two guide resources, and `get_server_info` — the one call an agent makes
 * first. Driven through the SDK client over an in-memory transport pair, the
 * same path a remote client takes.
 */

const BASE = 'https://stash.example.com';

interface Harness {
  client: Client;
  db: ClawStashDB;
  dispose(): Promise<void>;
}

const open: Harness[] = [];

/** `baseUrl: null` builds the server the way the stdio entrypoint does — without a request URL. */
async function connect(scopes: TokenScope[], baseUrl: string | null = BASE): Promise<Harness> {
  const db = new ClawStashDB(':memory:');
  const server = createMcpServer(db, baseUrl ?? undefined, { scopes });
  const client = new Client({ name: 'onboarding-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const h: Harness = {
    client,
    db,
    async dispose() {
      await client.close();
      await server.close();
      db.close();
    },
  };
  open.push(h);
  return h;
}

afterEach(async () => {
  while (open.length) await open.pop()!.dispose();
});

async function serverInfo(h: Harness): Promise<Record<string, any>> {
  const result = (await h.client.callTool({ name: 'get_server_info', arguments: {} })) as {
    isError?: boolean;
    content: Array<{ type: string; text?: string }>;
  };
  expect(result.isError).toBeFalsy();
  return JSON.parse(result.content[0]!.text!);
}

describe('MCP initialize', () => {
  it('hands the client usage instructions that name get_server_info and the skill URL', async () => {
    const h = await connect(['read', 'write', 'mcp']);
    const instructions = h.client.getInstructions();
    expect(instructions).toBeTruthy();
    expect(instructions).toContain('get_server_info');
    expect(instructions).toContain(`${BASE}/api/agent-skill`);
  });
});

describe('MCP resources', () => {
  it('lists the skill and the onboarding guide', async () => {
    const h = await connect(['mcp']);
    const { resources } = await h.client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual(['clawstash://guide/onboarding', 'clawstash://guide/skill']);
    for (const r of resources) expect(r.mimeType).toBe('text/markdown');
  });

  it('serves the same text as the REST twins', async () => {
    const h = await connect(['mcp']);
    const textOf = (r: { contents: Array<{ text?: string; blob?: string }> }) =>
      r.contents[0]!.text;
    const skill = await h.client.readResource({ uri: 'clawstash://guide/skill' });
    expect(textOf(skill)).toBe(getAgentSkillText(BASE));
    const onboarding = await h.client.readResource({ uri: 'clawstash://guide/onboarding' });
    expect(textOf(onboarding)).toBe(getMcpOnboardingText(BASE));
  });
});

describe('get_server_info', () => {
  it('tells an mcp-only token what it can and cannot call, and withholds the build', async () => {
    const h = await connect(['mcp']);
    const info = await serverInfo(h);

    expect(info.auth.scopes).toEqual(['mcp']);
    const none = TOOL_DEFS.filter((t) => t.scope === 'none').map((t) => t.name);
    expect([...info.auth.tools.callable].sort()).toEqual([...none].sort());
    const gated = TOOL_DEFS.filter((t) => t.scope !== 'none').map((t) => ({
      tool: t.name,
      scope: t.scope,
    }));
    expect(info.auth.tools.requires_scope).toEqual(gated);

    // Same rule as /api/version: the fingerprint needs `read`.
    expect(info.server.version).toBeNull();
    expect(JSON.stringify(info)).not.toContain('commit_sha');
    expect(info.next_steps.join(' ')).toContain('read, write and mcp');
  });

  it('lists every tool as callable for a read+write token and includes the version', async () => {
    const h = await connect(['read', 'write', 'mcp']);
    const info = await serverInfo(h);
    expect([...info.auth.tools.callable].sort()).toEqual(TOOL_DEFS.map((t) => t.name).sort());
    expect(info.auth.tools.requires_scope).toEqual([]);
    expect(typeof info.server.version).toBe('string');
    expect(info.tool_count).toBe(TOOL_DEFS.length);
    expect(info.next_steps.join(' ')).toContain('create_stash');
  });

  it('warns a read-only token before it tries to write', async () => {
    const h = await connect(['read', 'mcp']);
    const info = await serverInfo(h);
    expect(info.auth.tools.callable).not.toContain('create_stash');
    expect(info.next_steps.join(' ')).toContain('cannot write');
  });

  it('reports endpoints, limits and transport for this instance', async () => {
    const h = await connect(['read', 'mcp']);
    const info = await serverInfo(h);
    expect(info.base_url).toBe(BASE);
    expect(info.transport).toBe('streamable-http');
    expect(info.endpoints.mcp).toBe(`${BASE}/mcp`);
    expect(info.endpoints.agent_skill).toBe(`${BASE}/api/agent-skill`);
    expect(info.limits.files_per_stash_max).toBe(100);
    expect(info.limits.page_limit_max).toBe(1000);
  });

  it('reports the stdio transport when built without a request URL', async () => {
    const h = await connect(['read', 'write', 'admin', 'mcp'], null);
    const info = await serverInfo(h);
    expect(info.transport).toBe('stdio');
    expect(info.base_url).toMatch(/^http:\/\/localhost:\d+$/);
  });
});
