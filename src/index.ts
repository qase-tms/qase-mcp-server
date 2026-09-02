#!/usr/bin/env node

/**
 * Qase MCP Server - Main Entry Point
 *
 * This MCP server provides comprehensive integration with the Qase Test Management Platform.
 * It exposes 90+ tools for managing projects, test cases, runs, results, defects, and more.
 *
 * Architecture:
 * - Supports multiple transports: stdio, sse, streamable-http
 * - Tools are registered via the global tool registry
 * - Operation modules self-register their tools on import
 * - All API errors are handled gracefully with user-friendly messages
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { toolRegistry } from './utils/registry.js';
import { VERSION } from './version.js';
import { setupSSETransport } from './transports/sse.js';
import { setupStreamableHttpTransport } from './transports/streamableHttp.js';

/**
 * Parse command line arguments
 */
function parseArgs(): { transport: string; port: number; host: string } {
  const args = process.argv.slice(2);

  // Default values
  let transport = 'stdio';
  let port = 3000;
  let host = '0.0.0.0';

  // Parse --transport
  const transportIndex = args.indexOf('--transport');
  if (transportIndex !== -1 && transportIndex + 1 < args.length) {
    transport = args[transportIndex + 1];
  }

  // Parse --port
  const portIndex = args.indexOf('--port');
  if (portIndex !== -1 && portIndex + 1 < args.length) {
    const parsedPort = parseInt(args[portIndex + 1], 10);
    if (!isNaN(parsedPort)) {
      port = parsedPort;
    }
  }

  // Parse --host
  const hostIndex = args.indexOf('--host');
  if (hostIndex !== -1 && hostIndex + 1 < args.length) {
    host = args[hostIndex + 1];
  }

  return { transport, port, host };
}

/**
 * Main function - Start the MCP server
 */
async function main() {
  const { transport, port, host } = parseArgs();

  // Log server information to stderr (stdout is used for MCP protocol)
  const title = `Qase MCP Server v${VERSION}`;
  const padding = 60 - title.length;
  const paddedTitle = `║  ${title}${' '.repeat(Math.max(padding - 2, 0))}║`;
  console.error('╔══════════════════════════════════════════════════════════════╗');
  console.error(paddedTitle);
  console.error('╚══════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error(`✓ Registered ${toolRegistry.getToolCount()} tools`);
  console.error('');

  try {
    switch (transport) {
      case 'stdio': {
        // Create stdio transport for communication
        const stdioTransport = new StdioServerTransport();

        // Connect server to transport
        await createServer().connect(stdioTransport);

        console.error(`✓ Server started successfully`);
        console.error(`✓ Transport: stdio`);
        console.error(`✓ Ready to receive requests`);
        console.error('');
        console.error('Note: This server uses stdio transport for communication.');
        console.error('      It is designed to be run by MCP clients (Claude, Cursor, etc.)');
        console.error('');
        break;
      }

      case 'sse': {
        console.error(`✓ Starting server with SSE transport on http://${host}:${port}/sse`);
        setupSSETransport(createServer(), {
          port,
          host,
          sseEndpoint: '/sse',
          messagesEndpoint: '/messages',
        });
        console.error(`✓ Server started successfully`);
        console.error(`✓ Transport: SSE (Server-Sent Events)`);
        console.error(`✓ Ready to receive requests`);
        console.error('');
        break;
      }

      case 'streamable-http': {
        console.error(
          `✓ Starting server with Streamable HTTP transport on http://${host}:${port}/mcp`,
        );
        setupStreamableHttpTransport(createServer, {
          port,
          host,
          endpoint: '/mcp',
        });
        console.error(`✓ Server started successfully`);
        console.error(`✓ Transport: Streamable HTTP`);
        console.error(`✓ Ready to receive requests`);
        console.error('');
        break;
      }

      default:
        throw new Error(
          `Unsupported transport type: ${transport}. Supported types: stdio, sse, streamable-http`,
        );
    }
  } catch (error) {
    console.error('═══════════════════════════════════════════════════════════════');
    console.error('FATAL ERROR: Server failed to start');
    console.error('═══════════════════════════════════════════════════════════════');
    console.error(error);
    process.exit(1);
  }
}

/**
 * Run the server and handle errors
 */
main().catch((error) => {
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('FATAL ERROR: Server failed to start');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error(error);
  process.exit(1);
});
