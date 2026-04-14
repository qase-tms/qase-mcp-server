import { CacheBackend } from './types.js';
import { InMemoryCache } from './memory.js';
import { RedisCache } from './redis.js';
import { RedisInvalidationBus } from './redis-bus.js';
import { LayeredCache } from './layered.js';

export { hashToken, buildCacheKey } from './keys.js';
export type { CacheBackend, InvalidationBus } from './types.js';
export { InMemoryCache } from './memory.js';
export { RedisCache } from './redis.js';
export { RedisInvalidationBus } from './redis-bus.js';
export { LayeredCache } from './layered.js';
export { getMetrics, resetMetricsForTest } from './metrics.js';

const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_MAX_PER_TENANT = 50;
const INVALIDATION_CHANNEL = 'qase-mcp:invalidations';

/**
 * Build the process-wide cache backend.
 *
 * If QASE_MCP_REDIS_URL is set, compose LayeredCache(L1 in-memory, L2 Redis,
 * pub/sub bus). Otherwise return plain InMemoryCache. The ioredis module is
 * dynamically imported only when the URL is present — stdio users never load it.
 */
export async function buildCache(): Promise<CacheBackend> {
  const l1 = new InMemoryCache({
    maxEntries: DEFAULT_MAX_ENTRIES,
    maxPerTenant: DEFAULT_MAX_PER_TENANT,
  });

  const redisUrl = process.env.QASE_MCP_REDIS_URL;
  if (!redisUrl) return l1;

  let Redis: any;
  try {
    const mod = await import('ioredis');
    Redis = mod.default ?? mod.Redis;
  } catch (err) {
    console.error(
      '[cache] QASE_MCP_REDIS_URL is set but the optional `ioredis` dependency is not installed. ' +
        'Falling back to in-memory cache only.',
      err,
    );
    return l1;
  }

  const clientOpts = { maxRetriesPerRequest: 3, enableReadyCheck: true };
  const l2Client = new Redis(redisUrl, clientOpts);
  const pubClient = new Redis(redisUrl, clientOpts);
  const subClient = new Redis(redisUrl, clientOpts);

  const l2 = new RedisCache(l2Client);
  const bus = new RedisInvalidationBus(pubClient, subClient, INVALIDATION_CHANNEL);

  return new LayeredCache(l1, l2, bus);
}

let instance: CacheBackend | null = null;
let pending: Promise<CacheBackend> | null = null;

/**
 * Lazy async singleton. First call triggers buildCache(); concurrent callers
 * share the same promise so we build exactly once.
 */
export async function getCache(): Promise<CacheBackend> {
  if (instance) return instance;
  if (!pending) {
    pending = buildCache().then((c) => {
      instance = c;
      pending = null;
      return c;
    });
  }
  return pending;
}

/** @internal */
export async function resetCacheForTest(): Promise<void> {
  if (instance) {
    await instance.close();
    instance = null;
  }
  pending = null;
}
