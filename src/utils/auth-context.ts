import { AsyncLocalStorage } from 'async_hooks';
import { createHash } from 'node:crypto';

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

/** The literal key used when there is no authenticated subject (OAuth off). */
export const LOCAL_SUBJECT = 'local';

/**
 * Derive the caller's identity for per-caller isolation — tool activation
 * (src/server.ts) and the destructive-confirmation caller binding
 * (src/utils/request-state.ts) both call this ONE function, so the two can
 * never drift apart.
 *
 * Precedence:
 *   1. `extra.sub` — set by our JWKS verifier (src/auth/jwks-verifier.ts)
 *      when OAuth validated a JWT that actually carries a `sub` claim.
 *   2. A digest of the per-request API token — covers every other
 *      reachable state that leaves `sub` unset: OAuth on with an opaque
 *      Qase token (src/auth/mcp-guard.ts passes it through without setting
 *      `req.auth`), a JWT with no `sub` claim, and the SSE transport, which
 *      has no OAuth wiring at all. Both HTTP transports
 *      (streamableHttp.ts, sse.ts) open `requestTokenStorage` for every
 *      request, so the token is available here without new plumbing.
 *      SHA-256 hex digest, never the token itself — the raw token would
 *      otherwise end up in a Redis key (tool activation) or a log line.
 *   3. `LOCAL_SUBJECT` — stdio, where there is no per-request token and one
 *      process serves one user, so a single shared identity is correct.
 */
export function subjectFromContext(ctx: {
  http?: { authInfo?: { extra?: Record<string, unknown> } };
}): string {
  const sub = ctx.http?.authInfo?.extra?.sub;
  if (typeof sub === 'string' && sub.length > 0) return sub;

  const token = requestTokenStorage.getStore();
  if (token) return createHash('sha256').update(token).digest('hex');

  return LOCAL_SUBJECT;
}
