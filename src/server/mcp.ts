import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ClawStashDB } from './db';
import { createMcpServer, LOCAL_STDIO_AUTH } from './mcp-server';

const db = new ClawStashDB();
// stdio has no HTTP layer and no token to check: the MCP client spawns this
// process locally with the operator's own privileges. It therefore runs with
// the full scope set (LOCAL_STDIO_AUTH) — unchanged from before the MCP tools
// were scope-gated.
const server = createMcpServer(db, undefined, LOCAL_STDIO_AUTH);

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
