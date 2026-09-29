/**
 * Server Context
 *
 * Per-request context for code that sits too far below a request handler to be
 * passed it, carried through AsyncLocalStorage the same way auth-context.ts
 * carries the caller's subject.
 *
 * Two stores live here: the MCP `Server` instance (for server-level features)
 * and the handler's own `ServerContext`, which is what the destructive-action
 * gate needs — it reads the retry's answers, the verified request state, and
 * the protocol era off it.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { inputRequired, inputResponse } from '@modelcontextprotocol/server';
import type { InputRequiredResult, Server, ServerContext } from '@modelcontextprotocol/server';
import { getRequestStateCodec, type ConfirmationState } from './request-state.js';

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

/** Per-request handler context, for code too far below the handler to be passed it. */
export const requestContextStorage = new AsyncLocalStorage<ServerContext>();

/**
 * Get the current request's handler context.
 * Returns undefined if called outside of a requestContextStorage.run() scope.
 */
export function getRequestContext(): ServerContext | undefined {
  return requestContextStorage.getStore();
}

/** The key the confirmation request and its answer are correlated by. */
const CONFIRM_KEY = 'confirm';

/**
 * Thrown by the destructive-action gate to hand an input-required result up to
 * the `tools/call` handler.
 *
 * Multi-round-trip works by RETURNING the request, but the gate is called from
 * inside plain tool handlers (`(args) => Promise<R>`) several frames below the
 * handler that does the returning — see src/operations-v2/escape/api.ts. An
 * exception is the only way up that does not change every handler's signature.
 */
export class InputRequiredSignal extends Error {
  constructor(readonly result: InputRequiredResult) {
    super('input required');
    this.name = 'InputRequiredSignal';
  }
}

/** Why a destructive action was refused. */
export type RefusalReason =
  /** The client cannot be shown a confirmation prompt at all. */
  | 'unsupported'
  /** The prompt was sent but no usable answer came back for this action. */
  | 'undeliverable'
  /** The human saw the prompt and said no. */
  | 'declined';

/** Outcome of the destructive-action gate. */
export type DestructiveConfirmation = { allowed: true } | { allowed: false; reason: RefusalReason };

const REFUSED_UNSUPPORTED = { allowed: false, reason: 'unsupported' } as const;

/**
 * Ask the user to confirm a destructive action, across a round trip.
 *
 * On the first round there is no answer, so the gate signals an input-required
 * result and the `tools/call` handler returns it; the client collects the
 * answer and retries the same call carrying it. On the retry the answer is
 * read straight off the request.
 *
 * Fail-closed: the action proceeds only on an explicit accept whose signed
 * state names this very tool. No request context, a client on a protocol
 * revision this server cannot ask, a decline, a cancel, an answer belonging to
 * some other confirmation — all refuse, and name the reason so the caller can
 * say what happened.
 */
export async function confirmDestructiveAction(
  toolName: string,
  args: Record<string, unknown>,
): Promise<DestructiveConfirmation> {
  const ctx = getRequestContext();
  if (!ctx) return REFUSED_UNSUPPORTED;

  // Round two: the client came back with an answer. `inputResponse` is what
  // separates a refusal from a missing answer — `acceptedContent` reads both
  // as "nothing", which would send a decline round the loop again until it hit
  // the client's maxRounds.
  const answer = inputResponse(ctx.mcpReq.inputResponses, CONFIRM_KEY);
  if (answer.kind === 'elicit') {
    // The state was already verified by the seam before this handler ran; all
    // that is left is that the answer belongs to THIS tool, not another
    // confirmation the same caller happens to have outstanding.
    const state = ctx.mcpReq.requestState<ConfirmationState>();
    if (state?.tool !== toolName) return { allowed: false, reason: 'undeliverable' };
    return answer.action === 'accept' ? { allowed: true } : { allowed: false, reason: 'declined' };
  }

  // Round one. A 2025-era request carries no per-request envelope. On a
  // stateless leg that is the end of it: the per-request instance never saw an
  // `initialize`, so nothing says the client could answer and there is no
  // connection to ask on — refuse, do not ask.
  //
  // A legacy connection that is still stateful (the SSE transport, and a stdio
  // connection that negotiated 2025) is the exception: that instance DID see
  // `initialize`, and the SDK's own legacy shim fulfils the same
  // input-required return by sending a real `elicitation/create` on it and
  // re-entering this handler with the answer. Declared capabilities are what
  // the shim's gate consults, so they are what decides here too.
  if (ctx.mcpReq.envelope === undefined && !getServer()?.getClientCapabilities()?.elicitation) {
    return REFUSED_UNSUPPORTED;
  }

  const argsPreview = Object.entries(args)
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`)
    .join('\n');

  throw new InputRequiredSignal(
    inputRequired({
      inputRequests: {
        [CONFIRM_KEY]: inputRequired.elicit({
          message:
            `Confirm destructive action: ${toolName}\n\n${argsPreview}\n\n` +
            'This permanently deletes the resource and cannot be undone.',
          // No fields to fill in: accepting the prompt is the confirmation, and
          // the client's own decline button is the refusal. A checkbox on top of
          // that only produced false refusals — people accepted the dialog and
          // left the box at its default.
          requestedSchema: { type: 'object', properties: {} },
        }),
      },
      requestState: await getRequestStateCodec().mint({ tool: toolName }, ctx),
    }),
  );
}

/** Human-readable explanation for a refused destructive action. */
export function describeRefusal(toolName: string, reason: RefusalReason): string {
  switch (reason) {
    case 'unsupported':
      return (
        `Refused "${toolName}": destructive actions need confirmation, and this client speaks an ` +
        `older revision of the MCP protocol (2025-11-25), on which this server cannot ask for it. ` +
        `Update the client to one that negotiates 2026-07-28, or delete in the Qase UI.`
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
