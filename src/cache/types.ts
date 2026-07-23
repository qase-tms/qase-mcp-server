/**
 * Cache abstraction. Implementations: InMemoryCache (Plan 1),
 * LayeredCache wrapping an optional RedisCache (Plan 2).
 */
export interface CacheBackend {
  /**
   * Look up a cached value. Returns undefined on miss or expiration.
   * Must never cross tenant boundaries — all isolation happens through the key.
   */
  get<T>(key: string): Promise<T | undefined>;

  /**
   * Write a value with a TTL in milliseconds. Overwrites any existing entry.
   */
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;

  /**
   * Remove a single entry. Silently no-op if key is absent.
   */
  delete(key: string): Promise<void>;

  /**
   * Remove every entry whose key starts with the given prefix.
   * Used for tenant-scoped invalidation and schema-version rollovers.
   */
  deleteByPrefix(prefix: string): Promise<void>;

  /**
   * Release underlying resources (timers, network connections).
   */
  close(): Promise<void>;
}

/**
 * Cross-instance invalidation bus. Implemented in Plan 2 with Redis Pub/Sub;
 * unused in Plan 1.
 */
export interface InvalidationBus {
  publish(prefix: string): Promise<void>;
  subscribe(handler: (prefix: string) => void): Promise<void>;
  close(): Promise<void>;
}
