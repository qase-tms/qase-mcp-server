/**
 * Multi-round-trip request state.
 *
 * A destructive confirmation now spans two requests: the first returns an
 * input-required result, the second carries the answer. Nothing on the server
 * remembers the first one — the only thing that connects them is the opaque
 * `requestState` string the client echoes back.
 */

import { randomBytes } from 'node:crypto';
import { createRequestStateCodec } from '@modelcontextprotocol/server';
import type { RequestStateCodec, ServerContext } from '@modelcontextprotocol/server';

/** What a pending destructive confirmation carries across the round trip. */
export interface ConfirmationState {
  /** The tool the confirmation was issued for; an answer only counts for it. */
  tool: string;
}

const MIN_KEY_BYTES = 32;

/**
 * requestState round-trips through the client, so it comes back as
 * attacker-controlled input and has to be integrity-checked. The SDK does not
 * do that for us — this is the HMAC layer it expects.
 *
 * The key must be the same on every replica that might receive the echoed
 * value. Without one we generate a random key and say so: a single replica
 * keeps working, a multi-replica deployment would reject its own second round.
 *
 * `bind` ties a minted confirmation to the caller and the method, so a
 * confirmation issued to one authenticated user cannot be replayed by another
 * — the spec's user-binding requirement for state that gates authorization.
 * The binding value never reaches the wire; the codec stores a keyed tag.
 */
export function createRequestStateCodecFromEnv(
  env: typeof process.env = process.env,
): RequestStateCodec<ConfirmationState> {
  const configured = env.QASE_MCP_REQUEST_STATE_KEY;
  if (configured !== undefined && Buffer.byteLength(configured) < MIN_KEY_BYTES) {
    throw new Error(
      `QASE_MCP_REQUEST_STATE_KEY must be at least ${MIN_KEY_BYTES} bytes; got ${Buffer.byteLength(configured)}.`,
    );
  }
  if (!configured) {
    console.error(
      '[RequestState] QASE_MCP_REQUEST_STATE_KEY is not set — generating a per-process key. ' +
        'Multi-round-trip confirmations will fail across replicas; set the variable to a shared ' +
        'value of at least 32 bytes before running more than one.',
    );
  }
  return createRequestStateCodec<ConfirmationState>({
    key: configured ?? randomBytes(MIN_KEY_BYTES),
    bind: (ctx: ServerContext) =>
      `${ctx.mcpReq.method}\0${
        (ctx as { http?: { authInfo?: { extra?: Record<string, unknown> } } }).http?.authInfo?.extra
          ?.sub ?? ''
      }`,
  });
}

/** The one codec this process mints and verifies with, built on first use. */
let processCodec: RequestStateCodec<ConfirmationState> | undefined;

/**
 * Lazy for the same reason as the event bus and the activation store:
 * importing the module must not build anything and must not write to stderr.
 */
export function getRequestStateCodec(): RequestStateCodec<ConfirmationState> {
  processCodec ??= createRequestStateCodecFromEnv();
  return processCodec;
}
