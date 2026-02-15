import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ClawStashDB } from './db';
import { createMcpServer } from './mcp-server';

const db = new ClawStashDB();
const server = createMcpServer(db);

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
