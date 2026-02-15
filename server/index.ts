import express, { ErrorRequestHandler, Request } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClawStashDB } from './db.js';
import { createStashRouter } from './routes/stashes.js';
import { createTokenRouter } from './routes/tokens.js';
import { createAdminRouter } from './routes/admin.js';
import { getOpenApiSpec } from './openapi.js';
import { getMcpSpecText, getMcpOnboardingText } from './mcp-spec.js';
import { getToolSummaries } from './tool-defs.js';
import { checkVersion } from './version.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcp-server.js';
import { requireScopeAuth } from './auth.js';

function getBaseUrl(req: Request): string {
  const proto = req.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(proto) ? proto[0] : proto) || req.protocol;
  const fwdHost = req.headers['x-forwarded-host'];
  const host = (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) || req.headers.host;
  return `${protocol}://${host}`;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = parseInt(process.env.PORT || '3001', 10);
const isProduction = process.env.NODE_ENV === 'production';

const db = new ClawStashDB();
db.cleanExpiredSessions();

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api/stashes', createStashRouter(db));
app.use('/api/tokens', createTokenRouter(db));
app.use('/api/admin', createAdminRouter(db));

// OpenAPI schema
app.get('/api/openapi', (req, res) => {
  res.json(getOpenApiSpec(getBaseUrl(req)));
});

// MCP spec (human/AI-readable, includes data types from OpenAPI)
app.get('/api/mcp-spec', (req, res) => {
  res.type('text/plain; charset=utf-8').send(getMcpSpecText(getBaseUrl(req)));
});

// MCP onboarding (AI self-onboarding guide with full spec, no auth required)
app.get('/api/mcp-onboarding', (req, res) => {
  res.type('text/plain; charset=utf-8').send(getMcpOnboardingText(getBaseUrl(req)));
});

// MCP tool summaries (structured JSON for frontend, derived from tool-defs.ts)
app.get('/api/mcp-tools', (_req, res) => {
  res.json(getToolSummaries());
});

// Version check (current version + latest available from GitHub)
app.get('/api/version', async (_req, res) => {
  const info = await checkVersion();
  res.json(info);
});

// MCP Streamable HTTP endpoint (stateless mode)
app.post('/mcp', async (req, res) => {
  // Auth check for MCP - requires 'mcp' scope (or admin)
  const auth = requireScopeAuth(db, req, 'mcp');
  if (!auth) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Authentication required. Provide a Bearer token with MCP scope.' },
      id: null,
    });
    return;
  }

  try {
    const mcpServer = createMcpServer(db, getBaseUrl(req));
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on('close', () => {
      transport.close();
      mcpServer.close();
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal MCP error' },
        id: null,
      });
    }
  }
});

app.get('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST for stateless MCP.' },
    id: null,
  });
});

app.delete('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Stateless mode - no sessions to delete.' },
    id: null,
  });
});

// Serve frontend in production (before error handler so static files take priority)
if (isProduction) {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  // SPA fallback: serve index.html for all non-API routes
  app.get(/^\/(?!api|mcp).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// JSON error handler for API errors
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);

app.listen(port, () => {
  console.log(`ClawStash server running on http://localhost:${port}`);
  if (!isProduction) {
    console.log(`API available at http://localhost:${port}/api/stashes`);
    console.log(`MCP endpoint at http://localhost:${port}/mcp`);
    console.log(`Frontend dev server expected at http://localhost:3000`);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
