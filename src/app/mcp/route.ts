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

  try {
    const baseUrl = getBaseUrl(req);
    const mcpServer = createMcpServer(db, baseUrl);
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    // Connect server to transport
    await mcpServer.connect(transport);

    // Handle the request using Web Standard API (NextRequest extends Request)
    const response = await transport.handleRequest(req);

    // Clean up (safe because enableJsonResponse ensures response is complete)
    await transport.close();
    await mcpServer.close();

    return response;
  } catch (err) {
    console.error('MCP error:', err);
    return jsonRpcError(-32603, 'Internal MCP error', 500);
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
