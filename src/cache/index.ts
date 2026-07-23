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

  // Fail fast when Redis is unreachable so cache ops degrade to L1 instead of
  // hanging the request. Without enableOfflineQueue:false + timeouts, ioredis
  // queues commands until (re)connect, which blocks getCache()/get()/set() and
  // times out the whole tool call when Redis is misconfigured or down.
  const commandOpts = {
    maxRetriesPerRequest: 1,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    connectTimeout: 3000,
    commandTimeout: 2000,
  };
  // The subscriber keeps its offline queue so the (re)subscribe survives
  // reconnects and cross-instance invalidation resumes once Redis is back.
  const subOpts = { maxRetriesPerRequest: 1, enableReadyCheck: true, connectTimeout: 3000 };
  const l2Client = new Redis(redisUrl, commandOpts);
  const pubClient = new Redis(redisUrl, commandOpts);
  const subClient = new Redis(redisUrl, subOpts);

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
