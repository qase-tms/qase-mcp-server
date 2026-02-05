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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { toolRegistry } from './utils/registry.js';
import { formatApiError, ToolExecutionError } from './utils/errors.js';
import { setupSSETransport } from './transports/sse.js';
import { setupStreamableHttpTransport } from './transports/streamableHttp.js';

// Import operation modules - each module registers its tools on import
import './operations/projects.js';
import './operations/cases.js';
import './operations/suites.js';
import './operations/runs.js';
import './operations/results.js';
import './operations/plans.js';
import './operations/shared-steps.js';
import './operations/shared-parameters.js';
import './operations/milestones.js';
import './operations/defects.js';
import './operations/environments.js';
import './operations/attachments.js';
import './operations/authors.js';
import './operations/custom-fields.js';
import './operations/system-fields.js';
import './operations/configurations.js';
import './operations/users.js';
import './operations/search.js';

/**
 * Create the MCP server instance
 */
const server = new Server(
  {
    name: 'qase-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

/**
 * Handler: List all available tools
 *
 * Returns all tools registered in the tool registry.
 * Called when the MCP client wants to discover available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = toolRegistry.getTools();
  console.error(`[Server] Listing ${tools.length} tools`);
  return { tools };
});

/**
 * Handler: Execute a tool
 *
 * Executes the specified tool with provided arguments.
 * Arguments are validated against the tool's schema before execution.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  console.error(`[Server] Executing tool: ${name}`);

  // Get tool handler from registry
  const handler = toolRegistry.getHandler(name);
  if (!handler) {
    throw new Error(`Unknown tool: ${name}. Use list_tools to see available tools.`);
  }

  try {
    // Execute the tool handler with provided arguments
    const result = await handler(args || {});

    // Return result in MCP format
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    // Handle tool execution errors (expected failures like validation, API errors)
    // These are returned with isError: true so the LLM can understand and recover
    if (error instanceof ToolExecutionError) {
      console.error(`[Server] Tool '${name}' execution error:`, error.message);
      return {
        content: [
          {
            type: 'text',
            text: error.toUserMessage(),
          },
        ],
        isError: true,
      };
    }

    // Handle unexpected errors (protocol-level failures)
    // Format error message using our error utilities
    const errorMessage = formatApiError(error);
    console.error(`[Server] Tool '${name}' unexpected error:`, errorMessage);

    // Return as tool execution error with isError: true for better LLM recovery
    return {
      content: [
        {
          type: 'text',
          text: errorMessage,
        },
      ],
      isError: true,
    };
  }
});

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
  console.error('╔════════════════════════════════════════════════════════════════╗');
  console.error('║           Qase MCP Server v1.0.0                               ║');
  console.error('╚════════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error(`✓ Registered ${toolRegistry.getToolCount()} tools`);
  console.error('');

  try {
    switch (transport) {
      case 'stdio': {
        // Create stdio transport for communication
        const stdioTransport = new StdioServerTransport();

        // Connect server to transport
        await server.connect(stdioTransport);

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
        setupSSETransport(server, {
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
        setupStreamableHttpTransport(server, {
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
