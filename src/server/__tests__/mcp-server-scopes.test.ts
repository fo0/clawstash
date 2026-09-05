import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js';
import { ClawStashDB } from '../db';
import type { TokenScope } from '../db';
import { createMcpServer } from '../mcp-server';
import { TOOL_DEFS } from '../tool-defs';
import type { ToolScope } from '../tool-defs';

/**
 * MCP tool authorization (privilege escalation via the MCP transport).
 *
 * `POST /mcp` gates on the `mcp` scope alone. `mcp` says "this token may
 * speak MCP" — it is a transport gate, not a capability grant — so a token
 * holding ONLY `mcp` must not be able to create, update, archive or delete
 * stashes through MCP while every REST write route rejects it for a missing
 * `write` scope.
 *
 * These tests drive a real `McpServer` through the SDK client over an
 * in-memory transport pair, so they exercise the same `tools/call` path a
 * remote MCP client uses. The stdio entrypoint (`npm run mcp`) carries no
 * per-request credentials and keeps full local trust — the last two tests
 * are its regression belt.
 */

type ToolCallResult = {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
};

const ALL_SCOPES: TokenScope[] = ['read', 'write', 'admin', 'mcp'];

/** Text of the first content block, for error-message assertions. */
function resultText(result: ToolCallResult): string {
  return result.content.map((c) => c.text ?? '').join('\n');
}

interface Harness {
  db: ClawStashDB;
  seedId: string;
  call(name: string, args?: Record<string, unknown>): Promise<ToolCallResult>;
  dispose(): Promise<void>;
}

async function connectWithScopes(scopes: TokenScope[]): Promise<Harness> {
  const db = new ClawStashDB(':memory:');
  const seed = db.createStash({
    name: 'Seed',
    files: [{ filename: 'seed.txt', content: 'seed content' }],
  });

  const server = createMcpServer(db, 'http://localhost:3000', { scopes });
  const client = new Client({ name: 'scope-test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return {
    db,
    seedId: seed.id,
    async call(name, args = {}) {
      return (await client.callTool({ name, arguments: args })) as ToolCallResult;
    },
    async dispose() {
      await client.close();
      await server.close();
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Tool inventory — every tool must be classified deliberately
// ---------------------------------------------------------------------------

/**
 * The full tool → scope mapping, pinned. A new MCP tool has to be added here
 * consciously, so a write tool cannot slip in unclassified (and therefore
 * ungated). `none` means "transport gate only": the tool returns the server's
 * own specification and touches no stash data — its REST twins
 * (`/api/openapi`, `/api/mcp-spec`, `/api/mcp-onboarding`) are unauthenticated
 * as well.
 */
const EXPECTED_TOOL_SCOPES: Record<string, ToolScope> = {
  create_stash: 'write',
  read_stash: 'read',
  read_stash_file: 'read',
  list_stashes: 'read',
  update_stash: 'write',
  delete_stash: 'write',
  archive_stash: 'write',
  search_stashes: 'read',
  list_tags: 'read',
  get_tag_graph: 'read',
  get_stats: 'read',
  get_rest_api_spec: 'none',
  get_mcp_spec: 'none',
  refresh_tools: 'none',
  check_version: 'read',
};

describe('MCP tool inventory', () => {
  it('declares a scope for every tool', () => {
    const actual = Object.fromEntries(TOOL_DEFS.map((t) => [t.name, t.scope]));
    expect(actual).toEqual(EXPECTED_TOOL_SCOPES);
  });

  it('classifies every stash-mutating tool as write', () => {
    const writeTools = TOOL_DEFS.filter((t) => t.scope === 'write').map((t) => t.name);
    expect(writeTools.sort()).toEqual(
      ['archive_stash', 'create_stash', 'delete_stash', 'update_stash'].sort(),
    );
  });
});

// ---------------------------------------------------------------------------
// mcp-only token — the privilege escalation this fix closes
// ---------------------------------------------------------------------------

describe('MCP tools with an mcp-only token', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await connectWithScopes(['mcp']);
  });

  afterEach(async () => {
    await h.dispose();
  });

  it('rejects create_stash and stores nothing', async () => {
    const result = await h.call('create_stash', {
      files: [{ filename: 'escalation.txt', content: 'should never be stored' }],
    });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('write');
    // Only the seeded stash exists — the call did not write.
    expect(h.db.listStashes({}).total).toBe(1);
  });

  it('rejects update_stash and leaves the stash untouched', async () => {
    const result = await h.call('update_stash', { id: h.seedId, name: 'renamed by attacker' });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('write');
    expect(h.db.getStashMeta(h.seedId)?.name).toBe('Seed');
  });

  it('rejects archive_stash and leaves the archive flag untouched', async () => {
    const result = await h.call('archive_stash', { id: h.seedId, archived: true });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('write');
    expect(h.db.getStashMeta(h.seedId)?.archived).toBe(false);
  });

  it('rejects delete_stash and keeps the stash', async () => {
    const result = await h.call('delete_stash', { id: h.seedId });
    expect(result.isError).toBe(true);
    expect(resultText(result)).toContain('write');
    expect(h.db.getStashMeta(h.seedId)).not.toBeNull();
  });

  it('rejects read tools too — mcp alone grants no data access', async () => {
    for (const [name, args] of [
      ['list_stashes', {}],
      ['read_stash', { id: h.seedId }],
      ['read_stash_file', { id: h.seedId, filename: 'seed.txt' }],
      ['search_stashes', { query: 'seed' }],
      ['list_tags', {}],
      ['get_tag_graph', {}],
      ['get_stats', {}],
    ] as Array<[string, Record<string, unknown>]>) {
      const result = await h.call(name, args);
      expect(result.isError, `${name} should be denied`).toBe(true);
      expect(resultText(result)).toContain('read');
    }
  });

  it('still serves the self-description tools (transport gate only)', async () => {
    for (const name of ['get_mcp_spec', 'get_rest_api_spec', 'refresh_tools']) {
      const result = await h.call(name);
      expect(result.isError, `${name} should be allowed`).toBeFalsy();
    }
  });
});

// ---------------------------------------------------------------------------
// read + mcp — reads work, writes stay closed
// ---------------------------------------------------------------------------

describe('MCP tools with a read+mcp token', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await connectWithScopes(['read', 'mcp']);
  });

  afterEach(async () => {
    await h.dispose();
  });

  it('allows every read tool', async () => {
    for (const [name, args] of [
      ['list_stashes', {}],
      ['read_stash', { id: h.seedId }],
      ['read_stash_file', { id: h.seedId, filename: 'seed.txt' }],
      ['search_stashes', { query: 'seed' }],
      ['list_tags', {}],
      ['get_tag_graph', {}],
      ['get_stats', {}],
    ] as Array<[string, Record<string, unknown>]>) {
      const result = await h.call(name, args);
      expect(result.isError, `${name} should be allowed`).toBeFalsy();
    }
  });

  it('still rejects every write tool', async () => {
    for (const [name, args] of [
      ['create_stash', { files: [{ filename: 'a.txt', content: 'x' }] }],
      ['update_stash', { id: h.seedId, name: 'nope' }],
      ['archive_stash', { id: h.seedId, archived: true }],
      ['delete_stash', { id: h.seedId }],
    ] as Array<[string, Record<string, unknown>]>) {
      const result = await h.call(name, args);
      expect(result.isError, `${name} should be denied`).toBe(true);
      expect(resultText(result)).toContain('write');
    }
    expect(h.db.listStashes({}).total).toBe(1);
    expect(h.db.getStashMeta(h.seedId)?.name).toBe('Seed');
  });
});

// ---------------------------------------------------------------------------
// Regression belt — a properly scoped token keeps every capability it had
// ---------------------------------------------------------------------------

describe('MCP tools with a read+write+mcp token', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await connectWithScopes(['read', 'write', 'mcp']);
  });

  afterEach(async () => {
    await h.dispose();
  });

  it('can create, update, archive and delete', async () => {
    const created = await h.call('create_stash', {
      name: 'From MCP',
      files: [{ filename: 'a.txt', content: 'hello' }],
    });
    expect(created.isError).toBeFalsy();
    const createdId = (JSON.parse(resultText(created)) as { id: string }).id;
    expect(h.db.getStashMeta(createdId)?.name).toBe('From MCP');

    const updated = await h.call('update_stash', { id: createdId, name: 'Renamed' });
    expect(updated.isError).toBeFalsy();
    expect(h.db.getStashMeta(createdId)?.name).toBe('Renamed');

    const archived = await h.call('archive_stash', { id: createdId, archived: true });
    expect(archived.isError).toBeFalsy();
    expect(h.db.getStashMeta(createdId)?.archived).toBe(true);

    const deleted = await h.call('delete_stash', { id: createdId });
    expect(deleted.isError).toBeFalsy();
    expect(h.db.getStashMeta(createdId)).toBeNull();
  });

  it('can still read', async () => {
    const result = await h.call('read_stash', { id: h.seedId });
    expect(result.isError).toBeFalsy();
    expect(resultText(result)).toContain('Seed');
  });
});

describe('MCP tools with an admin token', () => {
  it('admin implies write — the ladder from auth.ts still applies', async () => {
    const h = await connectWithScopes(['admin', 'mcp']);
    try {
      const created = await h.call('create_stash', {
        files: [{ filename: 'a.txt', content: 'x' }],
      });
      expect(created.isError).toBeFalsy();
      expect(h.db.listStashes({}).total).toBe(2);
    } finally {
      await h.dispose();
    }
  });
});

describe('MCP tools in open mode', () => {
  it('grants everything when no ADMIN_PASSWORD is set (all scopes)', async () => {
    const h = await connectWithScopes(ALL_SCOPES);
    try {
      const created = await h.call('create_stash', {
        files: [{ filename: 'a.txt', content: 'x' }],
      });
      expect(created.isError).toBeFalsy();
    } finally {
      await h.dispose();
    }
  });
});

// ---------------------------------------------------------------------------
// stdio transport — no HTTP auth, must keep full local trust
// ---------------------------------------------------------------------------

describe('stdio MCP server', () => {
  it('still writes: a locally spawned stdio server keeps full trust', async () => {
    const db = new ClawStashDB(':memory:');
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    // Mirrors src/server/mcp.ts: no per-request credentials on stdio, so the
    // process-local caller gets the full scope set.
    const server = createMcpServer(db, undefined, { scopes: ALL_SCOPES });
    const transport = new StdioServerTransport(stdin, stdout);
    await server.connect(transport);

    const pending = new Map<number, (value: Record<string, unknown>) => void>();
    let buffer = '';
    stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) {
          const message = JSON.parse(line) as { id?: number };
          if (typeof message.id === 'number') {
            pending.get(message.id)?.(message as Record<string, unknown>);
            pending.delete(message.id);
          }
        }
        index = buffer.indexOf('\n');
      }
    });

    const request = (id: number, method: string, params: unknown) =>
      new Promise<Record<string, unknown>>((resolve) => {
        pending.set(id, resolve);
        stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
      });

    try {
      const init = await request(1, 'initialize', {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'stdio-test', version: '1.0.0' },
      });
      expect(init.error).toBeUndefined();
      stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

      const call = await request(2, 'tools/call', {
        name: 'create_stash',
        arguments: { name: 'Via stdio', files: [{ filename: 'a.txt', content: 'x' }] },
      });
      const result = (call.result ?? {}) as ToolCallResult;
      expect(call.error).toBeUndefined();
      expect(result.isError).toBeFalsy();
      expect(db.listStashes({}).total).toBe(1);
    } finally {
      await server.close();
      db.close();
    }
  });

  it('the stdio entrypoint opts into that full-trust context explicitly', () => {
    const source = readFileSync(new URL('../mcp.ts', import.meta.url), 'utf8');
    expect(source).toContain('LOCAL_STDIO_AUTH');
  });
});
