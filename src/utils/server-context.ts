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
import {
  CLIENT_CAPABILITIES_META_KEY,
  inputRequired,
  inputResponse,
} from '@modelcontextprotocol/server';
import type { InputRequiredResult, Server, ServerContext } from '@modelcontextprotocol/server';
import { digestArguments, getRequestStateCodec, type ConfirmationState } from './request-state.js';

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
  /** The client speaks an era on which this server cannot ask at all. */
  | 'unsupported'
  /** The client speaks the right era but never said it can show a prompt. */
  | 'incapable'
  /** The prompt was sent but no usable answer came back for this action. */
  | 'undeliverable'
  /** The human saw the prompt and said no. */
  | 'declined'
  /**
   * The client dropped the prompt instead of answering it.
   *
   * Kept apart from `declined` deliberately. Reporting a cancel as a refusal
   * tells somebody they said no to a question they were never shown — which
   * is exactly how this reached us: a tester was told they had declined a run
   * deletion they had never been asked about.
   */
  | 'cancelled';

/** Outcome of the destructive-action gate. */
export type DestructiveConfirmation = { allowed: true } | { allowed: false; reason: RefusalReason };

const REFUSED_UNSUPPORTED = { allowed: false, reason: 'unsupported' } as const;
const REFUSED_INCAPABLE = { allowed: false, reason: 'incapable' } as const;

/**
 * Whether a 2026 request's own envelope says the client can be shown a form.
 *
 * The capability is per request, not per connection: the SDK refuses to send
 * an input request a client never declared it can handle, and does so by
 * throwing. Reading the same declaration ourselves turns that into an answer
 * the caller can act on instead of an exception from inside the transport.
 */
function clientCanBeAsked(envelope: Record<string, unknown>): boolean {
  const declared = envelope[CLIENT_CAPABILITIES_META_KEY] as { elicitation?: unknown } | undefined;
  return declared?.elicitation !== undefined;
}

/**
 * Ask the user to confirm a destructive action, across a round trip.
 *
 * On the first round there is no answer, so the gate signals an input-required
 * result and the `tools/call` handler returns it; the client collects the
 * answer and retries the same call carrying it. On the retry the answer is
 * read straight off the request.
 *
 * Fail-closed: the action proceeds only on an explicit accept whose signed
 * state names this very call — this tool, with these arguments. No request
 * context, a client on a protocol revision this server cannot ask, a decline,
 * a cancel, an answer belonging to some other confirmation — all refuse, and
 * name the reason so the caller can say what happened.
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
    // The state was already verified by the seam before this handler ran — it
    // is this process's own, for this caller, unexpired. What is left is that
    // the answer belongs to THIS call: the same tool, and the same arguments
    // the human was shown. Neither alone is enough. Without the tool, one
    // confirmation would open every destructive tool; without the arguments,
    // one confirmed deletion would authorise every other deletion by the same
    // tool until the state expired.
    //
    // A plain string comparison, not `timingSafeEqual`: both operands are
    // public values derived from arguments the caller itself sent, and the one
    // from the wire is already integrity-proven, so there is no secret for a
    // timing difference to leak. `timingSafeEqual` would also throw on a
    // length mismatch, which is a shape this has to answer rather than crash.
    const state = ctx.mcpReq.requestState<ConfirmationState>();
    if (state?.tool !== toolName || state.arguments !== digestArguments(args)) {
      // Not a decline: the human never saw these arguments, so nobody said no
      // — and nobody said yes either. Unconfirmed, nothing deleted.
      return { allowed: false, reason: 'undeliverable' };
    }
    if (answer.action === 'accept') return { allowed: true };
    // `cancel` is the client dropping the question, `decline` is a person
    // answering it. Only one of them is somebody saying no.
    return { allowed: false, reason: answer.action === 'cancel' ? 'cancelled' : 'declined' };
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
  const envelope = ctx.mcpReq.envelope;
  if (envelope === undefined) {
    if (!getServer()?.getClientCapabilities()?.elicitation) return REFUSED_UNSUPPORTED;
  } else if (!clientCanBeAsked(envelope)) {
    return REFUSED_INCAPABLE;
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
      requestState: await getRequestStateCodec().mint(
        { tool: toolName, arguments: digestArguments(args) },
        ctx,
      ),
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
    case 'incapable':
      return (
        `Refused "${toolName}": destructive actions need confirmation, and this client did not ` +
        `declare that it can show one, so there is nowhere to ask. Use a client that supports ` +
        `confirmation prompts, or delete it in the Qase UI.`
      );
    case 'declined':
      return `Action "${toolName}" declined by the user. Nothing was deleted.`;
    case 'cancelled':
      return (
        `Action "${toolName}" was not confirmed: the client cancelled the confirmation request ` +
        `instead of answering it. Nothing was deleted. If you were never shown a prompt, the ` +
        `client received the request and dropped it — check that it supports confirmation ` +
        `prompts, or delete it in the Qase UI.`
      );
  }
}
