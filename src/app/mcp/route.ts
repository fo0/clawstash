import { NextRequest, NextResponse } from 'next/server';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '@/server/mcp-server';
import { getDb } from '@/server/singleton';
import { requireScopeAuth } from '@/server/auth';
import { getBaseUrl } from '@/app/api/_helpers';

function jsonRpcError(code: number, message: string, status: number) {
  return NextResponse.json(
    { jsonrpc: '2.0', error: { code, message }, id: null },
    { status },
  );
}

// POST /mcp — Streamable HTTP MCP endpoint (stateless)
export async function POST(req: NextRequest) {
  const db = getDb();

  // Auth check
  const auth = requireScopeAuth(db, req, 'mcp');
  if (!auth) {
    return jsonRpcError(-32000, 'Authentication required. Provide a Bearer token with MCP scope.', 401);
  }

  const baseUrl = getBaseUrl(req);
  const mcpServer = createMcpServer(db, baseUrl);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    // Connect server to transport
    await mcpServer.connect(transport);

    // Handle the request using Web Standard API (NextRequest extends Request)
    const response = await transport.handleRequest(req);

    return response;
  } catch (err) {
    console.error('MCP error:', err);
    return jsonRpcError(-32603, 'Internal MCP error', 500);
  } finally {
    // Always tear both halves down — previously, if `transport.close()` threw,
    // `mcpServer.close()` was never reached, leaking server-side state across
    // requests in the stateless flow. We swallow cleanup errors per-handle so
    // a half-broken transport does not also block the McpServer release.
    try {
      await transport.close();
    } catch (closeErr) {
      console.error('MCP transport close error:', closeErr);
    }
    try {
      await mcpServer.close();
    } catch (closeErr) {
      console.error('MCP server close error:', closeErr);
    }
  }
}

// GET /mcp — Not allowed (stateless mode)
export async function GET() {
  return jsonRpcError(-32000, 'Method not allowed. Use POST for stateless MCP.', 405);
}

// DELETE /mcp — Not allowed (stateless mode)
export async function DELETE() {
  return jsonRpcError(-32000, 'Method not allowed. Stateless mode - no sessions to delete.', 405);
}
