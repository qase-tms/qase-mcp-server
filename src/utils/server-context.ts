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
import type { RequestId } from '@modelcontextprotocol/sdk/types.js';

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

/** Why a destructive action was refused. */
export type RefusalReason =
  /** The client cannot show a confirmation prompt at all. */
  | 'unsupported'
  /** The prompt was sent but no answer came back (dropped, timed out). */
  | 'undeliverable'
  /** The human saw the prompt and said no. */
  | 'declined';

/** Outcome of the destructive-action gate. */
export type DestructiveConfirmation = { allowed: true } | { allowed: false; reason: RefusalReason };

const REFUSED_UNSUPPORTED = { allowed: false, reason: 'unsupported' } as const;

/**
 * Ask the user to confirm a destructive action via MCP elicitation.
 *
 * Fail-closed: the action proceeds only on an explicit yes. Anything else —
 * no server, no elicitation capability, an undelivered prompt, a decline —
 * refuses and names the reason, so the caller can say what happened.
 *
 * `relatedRequestId` is what makes the prompt arrive: without it the SDK sends
 * the request on the standalone SSE stream (opened by `GET /mcp`), which MCP
 * clients do not open, and the prompt is silently dropped.
 */
export async function confirmDestructiveAction(
  toolName: string,
  args: Record<string, unknown>,
  relatedRequestId?: RequestId,
): Promise<DestructiveConfirmation> {
  const server = getServer();
  if (!server) return REFUSED_UNSUPPORTED;

  // Check if the client supports elicitation
  const caps = server.getClientCapabilities();
  if (!caps?.elicitation) return REFUSED_UNSUPPORTED;

  try {
    const argsPreview = Object.entries(args)
      .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
      .join('\n');

    const result = await server.elicitInput(
      {
        message:
          `Confirm destructive action: ${toolName}\n\n${argsPreview}\n\n` +
          'This permanently deletes the resource and cannot be undone.',
        // No fields to fill in: accepting the prompt is the confirmation, and
        // the client's own decline button is the refusal. A checkbox on top of
        // that only produced false refusals — people accepted the dialog and
        // left the box at its default.
        requestedSchema: { type: 'object', properties: {} },
      },
      relatedRequestId === undefined ? undefined : { relatedRequestId },
    );

    return result.action === 'accept' ? { allowed: true } : { allowed: false, reason: 'declined' };
  } catch (error) {
    // The prompt never came back — refuse rather than delete unconfirmed.
    console.error('[Server] Elicitation failed, refusing destructive action:', error);
    return { allowed: false, reason: 'undeliverable' };
  }
}

/** Human-readable explanation for a refused destructive action. */
export function describeRefusal(toolName: string, reason: RefusalReason): string {
  switch (reason) {
    case 'unsupported':
      return (
        `Refused "${toolName}": destructive actions need confirmation, and this client ` +
        `does not support MCP elicitation, so it cannot be asked for. Use a client that ` +
        `declares the elicitation capability, or perform the deletion in the Qase UI.`
      );
    case 'undeliverable':
      return (
        `Refused "${toolName}": the confirmation prompt was not answered, so the action ` +
        `was not confirmed. Nothing was deleted. Retry and answer the prompt.`
      );
    case 'declined':
      return `Action "${toolName}" declined by the user. Nothing was deleted.`;
  }
}
