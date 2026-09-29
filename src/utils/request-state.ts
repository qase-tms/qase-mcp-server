/**
 * Multi-round-trip request state.
 *
 * A destructive confirmation now spans two requests: the first returns an
 * input-required result, the second carries the answer. Nothing on the server
 * remembers the first one — the only thing that connects them is the opaque
 * `requestState` string the client echoes back.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createRequestStateCodec } from '@modelcontextprotocol/server';
import type { RequestStateCodec, ServerContext } from '@modelcontextprotocol/server';
import { subjectFromContext } from './auth-context.js';

/** What a pending destructive confirmation carries across the round trip. */
export interface ConfirmationState {
  /** The tool the confirmation was issued for; an answer only counts for it. */
  tool: string;
  /**
   * Digest of the arguments the human was shown.
   *
   * The tool name alone does not say WHAT was confirmed. Without this, an
   * accepted `qase_case_delete {code:'TEST', id:1}` could be echoed back
   * unchanged against `{code:'PROD', id:999}` for the whole lifetime of the
   * state — same caller, same tool, valid signature — and the second case
   * would be deleted with nobody asked. The client here is the agent, and
   * stopping exactly that is what this gate is for.
   */
  arguments: string;
}

const MIN_KEY_BYTES = 32;

/**
 * How long a confirmation stays answerable.
 *
 * This is a human's thinking time, not a protocol timeout: the prompt is in
 * front of a person deciding whether to delete something. Ten minutes is long
 * enough to read the arguments, check them elsewhere and come back, and short
 * enough that an answer given before lunch is not still spendable after it.
 * It is the SDK's own default, stated here because it is a policy decision
 * rather than an implementation detail.
 */
export const CONFIRMATION_TTL_SECONDS = 600;

/** Recursively sort object keys so two spellings of one value serialise alike. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(source)
      .sort()
      .map((key) => [key, canonicalize(source[key])]),
  );
}

/**
 * Digest of a call's arguments, for pinning a confirmation to the exact call
 * the human saw.
 *
 * Canonical: keys are sorted at every depth, so `{a:1,b:2}` and `{b:2,a:1}`
 * agree — the same call written two ways is the same call, and a client that
 * re-serialises its arguments between rounds must not be told its answer no
 * longer counts. Array order is preserved, because it is part of the value.
 */
export function digestArguments(args: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(args)))
    .digest('hex');
}

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
 * The caller identity comes from `subjectFromContext` (auth-context.ts) — the
 * same derivation tool activation uses — so a caller with no OAuth `sub` is
 * bound by their per-request token digest rather than collapsing onto one
 * shared, empty binding for everyone.
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
    ttlSeconds: CONFIRMATION_TTL_SECONDS,
    bind: (ctx: ServerContext) => `${ctx.mcpReq.method}\0${subjectFromContext(ctx)}`,
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
