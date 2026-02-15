import { NextRequest, NextResponse } from 'next/server';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const body = await req.json();

    // Connect server to transport
    await mcpServer.connect(transport);

    // Use handleRequest with a simulated request/response pair
    // StreamableHTTPServerTransport.handleRequest expects IncomingMessage/ServerResponse,
    // so we create a compatible response object that collects the output
    const headers: Record<string, string> = {};
    let statusCode = 200;
    let responseBody = '';
    const chunks: string[] = [];
    let isSSE = false;

    const fakeRes = {
      writeHead(status: number, hdrs?: Record<string, string>) {
        statusCode = status;
        if (hdrs) Object.assign(headers, hdrs);
        return fakeRes;
      },
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      write(chunk: string | Buffer) {
        chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
        return true;
      },
      end(data?: string | Buffer) {
        if (data) {
          responseBody = typeof data === 'string' ? data : data.toString();
        } else {
          responseBody = chunks.join('');
        }
      },
      on(_event: string, _handler: () => void) {
        return fakeRes;
      },
      headersSent: false,
    };

    const fakeReq = {
      method: 'POST',
      headers: Object.fromEntries(req.headers.entries()),
      body,
    };

    await transport.handleRequest(fakeReq as never, fakeRes as never, body);

    // Clean up
    transport.close();
    await mcpServer.close();

    // Check if it's SSE
    isSSE = headers['content-type']?.includes('text/event-stream') ?? false;

    if (isSSE) {
      return new NextResponse(responseBody || chunks.join(''), {
        status: statusCode,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      });
    }

    // Regular JSON response
    const finalBody = responseBody || chunks.join('');
    return new NextResponse(finalBody, {
      status: statusCode,
      headers: { 'Content-Type': headers['content-type'] || 'application/json' },
    });
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
