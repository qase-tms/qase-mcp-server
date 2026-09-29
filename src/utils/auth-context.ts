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
      'QASE_API_TOKEN environment variable is required or a per-request Bearer token must be provided. ' +
        'Get your API token from: https://app.qase.io/user/api/token',
    );
  }
  return envToken;
}

/**
 * Per-request subject storage.
 *
 * Holds the caller identity — `authInfo.extra.sub` when OAuth verified the
 * request, `'local'` otherwise — for the current async context. Tool
 * handlers run several calls deep from the request handler that knows the
 * subject (they only receive their arguments, not `ctx`), so the value
 * travels the same way the per-request token does above rather than through
 * a second, bespoke mechanism.
 */
export const requestSubjectStorage = new AsyncLocalStorage<string>();

/** The literal key used when there is no authenticated subject (OAuth off). */
export const LOCAL_SUBJECT = 'local';

/**
 * Read the caller identity for the current async context, falling back to
 * the shared `'local'` key when there is none (no OAuth, or running outside
 * a `requestSubjectStorage.run()` scope).
 */
export function getEffectiveSubject(): string {
  return requestSubjectStorage.getStore() ?? LOCAL_SUBJECT;
}
