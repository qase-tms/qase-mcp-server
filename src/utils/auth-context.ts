import { AsyncLocalStorage } from 'async_hooks';

/**
 * Per-request token storage.
 * Holds the Bearer token extracted from the Authorization header for the current request.
 * Empty string means no user token — fall back to shared QASE_API_TOKEN.
 */
export const requestTokenStorage = new AsyncLocalStorage<string>();
