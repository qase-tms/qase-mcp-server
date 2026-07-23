/**
 * Server Context
 *
 * Provides access to the MCP Server instance within tool handlers
 * via AsyncLocalStorage, following the same pattern as auth-context.ts.
 *
 * This enables features that require server-level access (elicitation,
 * tool list notifications) without passing the server through handler signatures.
 */

import { AsyncLocalStorage } from 'async_hooks';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Per-request server storage.
 * Holds the Server instance for the current request context.
 */
export const serverStorage = new AsyncLocalStorage<Server>();

/**
 * Get the Server instance from the current async context.
 * Returns undefined if called outside of a serverStorage.run() scope.
 */
export function getServer(): Server | undefined {
  return serverStorage.getStore();
}

/**
 * Ask the user to confirm a destructive action via MCP elicitation.
 *
 * Graceful degradation:
 * - No server in context → proceed (return true)
 * - Client doesn't support elicitation → proceed
 * - elicitInput() throws → proceed (log error)
 * - User declines or cancels → return false
 */
export async function confirmDestructiveAction(
  toolName: string,
  args: Record<string, unknown>,
): Promise<boolean> {
  const server = getServer();
  if (!server) return true;

  // Check if the client supports elicitation
  const caps = server.getClientCapabilities();
  if (!caps?.elicitation) return true;

  try {
    const argsPreview = Object.entries(args)
      .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
      .join('\n');

    const result = await server.elicitInput({
      message: `Confirm destructive action: ${toolName}\n\n${argsPreview}`,
      requestedSchema: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            title: 'Confirm deletion',
            description: 'This will permanently delete the resource. Proceed?',
            default: false,
          },
        },
        required: ['confirm'],
      },
    });

    return result.action === 'accept' && result.content?.confirm === true;
  } catch (error) {
    // Elicitation failed — graceful degradation: proceed without confirmation
    console.error('[Server] Elicitation failed, proceeding without confirmation:', error);
    return true;
  }
}
