/**
 * Hidden attribution arguments on a tools/call.
 *
 * A client cannot vary an HTTP header per call — the transport captures the
 * integration marker once per MCP session — so an integration that wants to
 * attribute individual calls has to put the marker in the arguments. These two
 * fields are that channel. They are deliberately not declared in any tool's
 * input schema: they are not parameters, and no model should be asked to supply
 * them.
 *
 * They are stripped here, before the handler sees the arguments. qase_api was
 * verified not to pass arguments through into a request body, but relying on no
 * handler ever doing so is an assumption with no expiry date.
 */

export const INTEGRATION_ARG = '_qase_integration';
export const PRODUCER_ARG = '_qase_producer';

export interface CallMarkers {
  integration?: string;
  producer?: string;
  rest: Record<string, unknown>;
}

export function extractCallMarkers(args: unknown): CallMarkers {
  if (!args || typeof args !== 'object') return { rest: {} };

  const {
    [INTEGRATION_ARG]: integration,
    [PRODUCER_ARG]: producer,
    ...rest
  } = args as Record<string, unknown>;

  return {
    integration: typeof integration === 'string' ? integration : undefined,
    producer: typeof producer === 'string' ? producer : undefined,
    rest,
  };
}
