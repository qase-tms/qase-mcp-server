#!/usr/bin/env node

/**
 * Qase MCP Server - Main Entry Point
 *
 * This MCP server provides comprehensive integration with the Qase Test Management Platform.
 * It exposes 90+ tools for managing projects, test cases, runs, results, defects, and more.
 *
 * Architecture:
 * - Uses stdio transport for communication with MCP clients
 * - Tools are registered via the global tool registry
 * - Operation modules self-register their tools on import
 * - All API errors are handled gracefully with user-friendly messages
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { toolRegistry } from './utils/registry.js';
import { formatApiError } from './utils/errors.js';

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
    // Format error message using our error utilities
    const errorMessage = formatApiError(error);
    console.error(`[Server] Tool '${name}' failed:`, errorMessage);
    throw new Error(`Tool '${name}' execution failed: ${errorMessage}`);
  }
});

/**
 * Main function - Start the MCP server
 */
async function main() {
  // Create stdio transport for communication
  const transport = new StdioServerTransport();

  // Connect server to transport
  await server.connect(transport);

  // Log server information to stderr (stdout is used for MCP protocol)
  console.error('╔════════════════════════════════════════════════════════════════╗');
  console.error('║           Qase MCP Server v1.0.0                               ║');
  console.error('╚════════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error(`✓ Server started successfully`);
  console.error(`✓ Registered ${toolRegistry.getToolCount()} tools`);
  console.error(`✓ Ready to receive requests`);
  console.error('');
  console.error('Note: This server uses stdio transport for communication.');
  console.error('      It is designed to be run by MCP clients (Claude, Cursor, etc.)');
  console.error('');
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
