/**
 * MCP Server factory
 *
 * Builds a configured Server instance with every request handler wired.
 * Kept out of index.ts so it can be exercised by tests — index.ts starts a
 * transport on import.
 */

import { Server, ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server';
import { getMetrics } from './cache/index.js';
import { toolRegistry } from './utils/registry.js';
import { formatApiError, ToolExecutionError } from './utils/errors.js';
import { compactResponse } from './utils/response-shape.js';
import { isRichResult } from './utils/rich-response.js';
import {
  serverStorage,
  requestContextStorage,
  InputRequiredSignal,
  confirmDestructiveAction,
  describeRefusal,
} from './utils/server-context.js';
import { getRequestStateCodec } from './utils/request-state.js';
import { extractCallMarkers } from './utils/call-markers.js';
import { parseProducerMarker } from './utils/producer-marker.js';
import { producerStorage } from './utils/producer-context.js';
import { callIntegrationStorage } from './utils/integration-context.js';
import { requestSubjectStorage, LOCAL_SUBJECT } from './utils/auth-context.js';
import { getActivationStore } from './tools/activation.js';
import { VERSION } from './version.js';
import { listPrompts, getPrompt } from './prompts/index.js';
import { SERVER_INSTRUCTIONS } from './server-instructions.js';

// Import operation modules - each module registers its tools on import
import './operations-v2/index.js';

/**
 * Both catalogs are served whole — no page is ever split, so no `nextCursor` is
 * issued. Any cursor a client sends is therefore one this server never handed
 * out, and the spec asks for Invalid params rather than a silently re-served
 * first page, which would loop a paginating client forever.
 */
function rejectUnknownCursor(cursor: unknown): void {
  if (cursor === undefined) return;
  throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Unknown pagination cursor');
}

/**
 * Identify the caller for a request. `extra.sub` is what our JWKS verifier
 * (src/auth/jwks-verifier.ts) writes onto `AuthInfo` when OAuth is on; with
 * OAuth off — or no token on this request — there is no `authInfo` at all,
 * and every caller shares the literal `'local'` key, matching today's
 * single-process behaviour.
 */
function subjectFromContext(ctx: {
  http?: { authInfo?: { extra?: Record<string, unknown> } };
}): string {
  const sub = ctx.http?.authInfo?.extra?.sub;
  return typeof sub === 'string' ? sub : LOCAL_SUBJECT;
}

/**
 * Create and configure a new MCP Server instance.
 *
 * Called once for stdio (single connection) and once per session for both
 * SSE and Streamable HTTP (multiple concurrent connections). Each session
 * needs its own Server instance because the SDK enforces one transport per
 * server.
 */
export function createServer(): Server {
  const server = new Server(
    {
      name: 'qase-mcp-server',
      // Display metadata clients render in their server list. Kept in sync with
      // server.json, the registry manifest that carries the same three values.
      title: 'Qase Test Management',
      version: VERSION,
      websiteUrl: 'https://qase.io',
      icons: [
        {
          src: 'https://raw.githubusercontent.com/qase-tms/qase-mcp-server/main/icon.png',
          mimeType: 'image/png',
        },
      ],
    },
    {
      capabilities: {
        tools: { listChanged: true },
        prompts: {},
      },
      instructions: SERVER_INSTRUCTIONS,
      // `requestState` is minted by the destructive-action gate and echoed
      // back by the client, so it re-enters as attacker-controlled input. The
      // seam runs this hook before the handler and answers a frozen -32602
      // when it throws, so the handler only ever sees state this process
      // signed, for this caller and this method.
      requestState: { verify: getRequestStateCodec().verify },
    },
  );

  /**
   * Handler: List all available tools
   *
   * Returns all tools registered in the tool registry.
   * Called when the MCP client wants to discover available tools.
   */
  server.setRequestHandler('tools/list', async (request, ctx) => {
    rejectUnknownCursor(request.params?.cursor);
    const subject = subjectFromContext(ctx);
    const active = await getActivationStore().get(subject);
    const tools = toolRegistry.getTools(active);
    console.error(`[Server] Listing ${tools.length} tools`);
    return { tools };
  });

  /**
   * Handler: List available prompts (workflow templates)
   */
  server.setRequestHandler('prompts/list', async (request) => {
    rejectUnknownCursor(request.params?.cursor);
    const prompts = listPrompts();
    console.error(`[Server] Listing ${prompts.length} prompts`);
    return { prompts };
  });

  /**
   * Handler: Get a specific prompt with arguments
   */
  server.setRequestHandler('prompts/get', async (request) => {
    const { name, arguments: args } = request.params;
    console.error(`[Server] Getting prompt: ${name}`);
    return getPrompt(name, args);
  });

  /**
   * Handler: Execute a tool
   *
   * Executes the specified tool with provided arguments.
   */
  server.setRequestHandler('tools/call', async (request, ctx) => {
    // The subject travels via AsyncLocalStorage rather than as a parameter:
    // qase_discover_tools' handler is a plain ToolHandler (args) => Promise<R>
    // several calls below, with no ctx of its own — see auth-context.ts.
    const subject = subjectFromContext(ctx);
    try {
      return await requestSubjectStorage.run(subject, () =>
        // The handler's own context travels the same way, for the same
        // reason: the destructive-action gate reads the retry's answers and
        // the verified request state off it, and is called from places with
        // no ctx of their own — see server-context.ts.
        requestContextStorage.run(ctx, () =>
          serverStorage.run(server, async () => {
            const { name, arguments: rawArgs } = request.params;
            // The two hidden attribution arguments never reach a tool handler — see
            // call-markers.ts for why they travel as arguments rather than a header.
            const markers = extractCallMarkers(rawArgs);
            const args = markers.rest;

            console.error(`[Server] Executing tool: ${name}`);
            getMetrics().incCounter('qase_mcp_tool_calls_total', { tool: name });

            const runCall = async () => {
              // Get tool handler from registry
              const handler = toolRegistry.getHandler(name);
              if (!handler) {
                throw new Error(`Unknown tool: ${name}. Use list_tools to see available tools.`);
              }

              // Confirm destructive actions before execution. The gate is
              // fail-closed — an unconfirmed deletion does not happen. On the
              // first round it signals an input-required result instead of
              // returning a verdict; the catch at the bottom of this handler
              // turns that into the call's result.
              const toolDef = toolRegistry.getTool(name);
              if (toolDef?.annotations?.destructiveHint === true) {
                const confirmation = await confirmDestructiveAction(name, args || {});
                if (!confirmation.allowed) {
                  console.error(
                    `[Server] Refused destructive tool '${name}': ${confirmation.reason}`,
                  );
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
                    ...(result.structuredContent && {
                      structuredContent: result.structuredContent,
                    }),
                  };
                }

                // Default: wrap in compact JSON text block
                const compacted = compactResponse(result);
                const hasOutputSchema = toolDef?.outputSchema !== undefined;
                return {
                  content: [
                    {
                      type: 'text' as const,
                      text: JSON.stringify(compacted),
                    },
                  ],
                  // SDK requires structuredContent when outputSchema is defined
                  ...(hasOutputSchema && {
                    structuredContent: compacted as Record<string, unknown>,
                  }),
                };
              } catch (error) {
                // Not a failure: the gate inside a tool handler (qase_api's
                // DELETE branch) is asking for confirmation. Let it past the
                // error mapping below, to the catch that returns it.
                if (error instanceof InputRequiredSignal) throw error;

                // Handle tool execution errors (expected failures like validation, API errors)
                // These are returned with isError: true so the LLM can understand and recover
                if (error instanceof ToolExecutionError) {
                  console.error(`[Server] Tool '${name}' execution error:`, error.message);
                  return {
                    content: [
                      {
                        type: 'text' as const,
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
                      type: 'text' as const,
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
          }),
        ),
      );
    } catch (error) {
      // Multi-round-trip: the destructive-action gate does not return a verdict
      // on the first round, it signals a request for confirmation from wherever
      // it was called. This catch sits ABOVE the one that maps errors onto
      // `isError` results, so the request reaches the client as the result of
      // the call rather than as the text of a failure.
      if (error instanceof InputRequiredSignal) return error.result;
      throw error;
    }
  });

  // Tool-list-changed push notifications used to be wired here through the
  // registry's process-wide listener set (toolRegistry.subscribeToolsChanged),
  // which assumed one activation event visible to every session. Activation
  // is per-caller state now (see src/tools/activation.ts), so that mechanism
  // is gone along with it; the 2026-07-28 era replaces the push with a client
  // pull via `subscriptions/listen` over a `ServerEventBus`, which a later
  // task in this migration wires in.

  return server;
}
