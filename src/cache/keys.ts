import { createHash } from 'crypto';

/**
 * Hash an API token into a stable, non-reversible tenant identifier.
 *
 * Why not raw tokens: tokens placed in Map keys land in heap snapshots, error
 * dumps, and debug logs. A sha256 truncation gives us a stable key that is
 * useless to anyone who sees it.
 */
export function hashToken(token: string): string {
  if (!token) {
    throw new Error('token must be non-empty');
  }
  return createHash('sha256').update(token).digest('hex').slice(0, 32);
}

export interface CacheKeyParts {
  host: string;
  tenantId: string;
  resource: string;
  scope?: string;
  params?: Record<string, unknown>;
}

/**
 * Build a composite cache key:
 *   v1:{host}:{tenantId}:{resource}:{scope}:{paramsJson}
 *
 * The `v1` prefix lets us wholesale-invalidate old entries on schema change.
 * Params are JSON-stringified with sorted keys so equivalent param objects
 * collapse to the same key.
 */
export function buildCacheKey(parts: CacheKeyParts): string {
  const scope = parts.scope ?? '';
  const params = parts.params ? stableStringify(parts.params) : '';
  return `v1:${parts.host}:${parts.tenantId}:${parts.resource}:${scope}:${params}`;
}

function stableStringify(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  const pairs: Record<string, unknown> = {};
  for (const k of sortedKeys) {
    pairs[k] = obj[k];
  }
  return JSON.stringify(pairs);
}
