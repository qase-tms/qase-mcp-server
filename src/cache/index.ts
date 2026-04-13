import { CacheBackend } from './types.js';
import { InMemoryCache } from './memory.js';

export { hashToken, buildCacheKey } from './keys.js';
export type { CacheBackend, InvalidationBus } from './types.js';
export { InMemoryCache } from './memory.js';

/**
 * Default cache configuration. Tuned for a few hundred tenants × a handful
 * of cached resources each.
 */
const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_MAX_PER_TENANT = 50;

/**
 * Build the process-wide cache backend.
 *
 * Plan 1: always returns InMemoryCache.
 * Plan 2 will branch on QASE_MCP_REDIS_URL and compose LayeredCache.
 */
export function buildCache(): CacheBackend {
  return new InMemoryCache({
    maxEntries: DEFAULT_MAX_ENTRIES,
    maxPerTenant: DEFAULT_MAX_PER_TENANT,
  });
}

/**
 * Singleton accessor. Lazy-initialized on first call. Tests may reset via
 * `resetCacheForTest()` (internal).
 */
let instance: CacheBackend | null = null;

export function getCache(): CacheBackend {
  if (!instance) {
    instance = buildCache();
  }
  return instance;
}

/** @internal */
export async function resetCacheForTest(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
}
