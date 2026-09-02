/**
 * MCP Server factory
 *
 * Builds a configured Server instance with every request handler wired.
 * Kept out of index.ts so it can be exercised by tests — index.ts starts a
 * transport on import.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
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
import {
  serverStorage,
  confirmDestructiveAction,
  describeRefusal,
} from './utils/server-context.js';
import { extractCallMarkers } from './utils/call-markers.js';
import { parseProducerMarker } from './utils/producer-marker.js';
import { producerStorage } from './utils/producer-context.js';
import { callIntegrationStorage } from './utils/integration-context.js';
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
export function createServer(): Server {
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
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    return serverStorage.run(server, async () => {
      const { name, arguments: rawArgs } = request.params;
      // The two hidden attribution arguments never reach a tool handler — see
      // call-markers.ts for why they travel as arguments rather than a header.
      const markers = extractCallMarkers(rawArgs);
      const args = markers.rest;

      console.error(`[Server] Executing tool: ${name}`);

      const runCall = async () => {
        // Get tool handler from registry
        const handler = toolRegistry.getHandler(name);
        if (!handler) {
          throw new Error(`Unknown tool: ${name}. Use list_tools to see available tools.`);
        }

        // Elicitation: confirm destructive actions before execution. The gate is
        // fail-closed — an unconfirmed deletion does not happen. extra.requestId
        // is what puts the prompt on the stream of this call, where the client
        // is listening.
        const toolDef = toolRegistry.getTool(name);
        if (toolDef?.annotations?.destructiveHint === true) {
          const confirmation = await confirmDestructiveAction(
            name,
            (args as Record<string, unknown>) || {},
            extra.requestId,
          );
          if (!confirmation.allowed) {
            console.error(`[Server] Refused destructive tool '${name}': ${confirmation.reason}`);
            return {
              content: [
                { type: 'text' as const, text: describeRefusal(name, confirmation.reason) },
              ],
              // A decline is the user's decision, not a tool failure; the other
              // reasons are something the caller has to act on.
              ...(confirmation.reason !== 'declined' && { isError: true }),
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
      };

      // Both scopes stay open for the whole call, so the outbound interceptor
      // sees them however deep in the handler the API request is made.
      const producer = parseProducerMarker(markers.producer);
      const withProducer = producer ? () => producerStorage.run(producer, runCall) : runCall;

      return markers.integration
        ? callIntegrationStorage.run(markers.integration, withProducer)
        : withProducer();
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
