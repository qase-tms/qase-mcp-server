import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request token storage.
 * Holds the Bearer token extracted from the Authorization header for the current request.
 * Empty string means no user token — fall back to shared QASE_API_TOKEN.
 */
export const requestTokenStorage = new AsyncLocalStorage<string>();

/**
 * Read the effective token for the current async context: request-scoped
 * token first, then QASE_API_TOKEN env var.
 *
 * Throws if neither is available so callers never silently fall back to a
 * global cache shard.
 */
export function getEffectiveToken(): string {
  const requestToken = requestTokenStorage.getStore();
  if (requestToken) return requestToken;
  const envToken = process.env.QASE_API_TOKEN;
  if (!envToken) {
    throw new Error(
      'QASE_API_TOKEN environment variable is required or a per-request Bearer token must be provided.',
    );
  }
  return envToken;
}
