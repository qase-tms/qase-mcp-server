import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request integration marker storage.
 *
 * Holds the raw `<name>/<version>` marker supplied by the integration driving
 * this request (see integration-marker.ts). Empty string means "this request
 * carried no marker" — fall back to the process-wide QASE_MCP_INTEGRATION.
 *
 * Same shape and lifecycle as requestTokenStorage in auth-context.ts: HTTP
 * transports open a scope per request, so two concurrent sessions with different
 * markers never observe each other's value.
 */
export const integrationStorage = new AsyncLocalStorage<string>();

/**
 * Per-call integration marker, supplied in the call arguments rather than a
 * header. Takes priority over the session-scoped value: a per-call claim is more
 * specific than one captured when the session opened.
 */
export const callIntegrationStorage = new AsyncLocalStorage<string>();

/**
 * Read the marker for the current async context: the per-call value first, then
 * the request-scoped one, then the QASE_MCP_INTEGRATION env var (the stdio path,
 * where there is no request to carry a header).
 *
 * Returns undefined when none is set — the common case, and the one that must
 * leave the outbound request untouched. The value is unvalidated; callers pass it
 * through parseIntegrationMarker().
 */
export function getIntegration(): string | undefined {
  const callIntegration = callIntegrationStorage.getStore();
  if (callIntegration) return callIntegration;

  const requestIntegration = integrationStorage.getStore();
  if (requestIntegration) return requestIntegration;
  return process.env.QASE_MCP_INTEGRATION?.trim() || undefined;
}
