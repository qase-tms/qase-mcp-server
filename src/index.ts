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
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { toolRegistry } from './utils/registry.js';
import { formatApiError, ToolExecutionError } from './utils/errors.js';
import { compactResponse } from './utils/response-shape.js';
import { isRichResult } from './utils/rich-response.js';
import { serverStorage, confirmDestructiveAction } from './utils/server-context.js';
import { setupSSETransport } from './transports/sse.js';
import { setupStreamableHttpTransport } from './transports/streamableHttp.js';
import { VERSION } from './version.js';
import { listPrompts, getPrompt } from './prompts/index.js';

// Import operation modules - each module registers its tools on import
import './operations-v2/index.js';

/**
 * Create and configure a new MCP Server instance.
 *
 * Called once for stdio/SSE (single connection) and once per session for
 * Streamable HTTP (multiple concurrent connections). Each session needs its
 * own Server instance because the SDK enforces one transport per server.
 */
function createServer(): Server {
  const server = new Server(
    {
      name: 'qase-mcp-server',
      version: VERSION,
    },
    {
      capabilities: {
        tools: { listChanged: true },
        prompts: {},
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
   * Handler: List available prompts (workflow templates)
   */
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    const prompts = listPrompts();
    console.error(`[Server] Listing ${prompts.length} prompts`);
    return { prompts };
  });

  /**
   * Handler: Get a specific prompt with arguments
   */
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[Server] Getting prompt: ${name}`);
    return getPrompt(name, args);
  });

  /**
   * Handler: Execute a tool
   *
   * Executes the specified tool with provided arguments.
   * Arguments are validated against the tool's schema before execution.
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    return serverStorage.run(server, async () => {
      const { name, arguments: args } = request.params;

      console.error(`[Server] Executing tool: ${name}`);

      // Get tool handler from registry
      const handler = toolRegistry.getHandler(name);
      if (!handler) {
        throw new Error(`Unknown tool: ${name}. Use list_tools to see available tools.`);
      }

      // Elicitation: confirm destructive actions before execution
      const toolDef = toolRegistry.getTool(name);
      if (toolDef?.annotations?.destructiveHint === true) {
        const confirmed = await confirmDestructiveAction(
          name,
          (args as Record<string, unknown>) || {},
        );
        if (!confirmed) {
          return {
            content: [{ type: 'text' as const, text: `Action "${name}" cancelled by user.` }],
          };
        }
      }

      try {
        // Execute the tool handler with provided arguments
        const result = await handler(args || {});

        // Rich results: pass through pre-formatted content blocks directly
        if (isRichResult(result)) {
          return {
            content: result.content,
            ...(result.structuredContent && { structuredContent: result.structuredContent }),
          };
        }

        // Default: wrap in compact JSON text block
        const compacted = compactResponse(result);
        const hasOutputSchema = toolDef?.outputSchema !== undefined;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(compacted),
            },
          ],
          // SDK requires structuredContent when outputSchema is defined
          ...(hasOutputSchema && { structuredContent: compacted as Record<string, unknown> }),
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
  });

  // Wire tool discovery notifications: when tools are activated via qase_discover_tools,
  // notify the client so it re-queries the tool list
  toolRegistry.onToolsChanged = () => {
    server.sendToolListChanged().catch((err) => {
      console.error('[Server] Failed to send tool list changed notification:', err);
    });
  };

  return server;
}

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
