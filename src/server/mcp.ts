import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ClawStashDB } from './db';
import { createLocalStdioMcpServer } from './mcp-server';

const db = new ClawStashDB();
// stdio has no HTTP layer and no token to check: the MCP client spawns this
// process locally with the operator's own privileges. It therefore runs with
// the full scope set — unchanged from before the MCP tools were scope-gated.
// The factory owns that decision; the full-trust context itself is private to
// `mcp-server.ts` so no request-served module can reach it (BACKLOG #149).
const server = createLocalStdioMcpServer(db);

// Start server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server error:', error);
  db.close();
  process.exit(1);
});

process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
