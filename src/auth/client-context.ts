import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request storage for the OAuth `/authorize` request's `redirect_uri`.
 *
 * The proxy is transparent: it echoes the incoming redirect_uri back through
 * `getClient` so the MCP SDK's local redirect_uri check passes, then forwards
 * the request to auth.qase.io, which is the authoritative validator of a
 * client's registered redirect URIs. Empty/undefined when no redirect_uri is
 * present on the request.
 */
export const authorizeRedirectUriStorage = new AsyncLocalStorage<string | undefined>();
