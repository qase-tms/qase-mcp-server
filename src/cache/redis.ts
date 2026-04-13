import { CacheBackend } from './types.js';

/**
 * Minimal subset of the ioredis client we rely on. Stated explicitly so tests
 * can pass a fake and so we avoid depending on the `ioredis` package at the
 * module-import level (it is an optional dependency).
 */
export interface RedisLikeClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  scan(
    cursor: string,
    matchKey: 'MATCH',
    pattern: string,
    countKey: 'COUNT',
    count: number,
  ): Promise<[string, string[]]>;
  unlink(...keys: string[]): Promise<number>;
  quit(): Promise<'OK'>;
}

/**
 * Redis-backed CacheBackend.
 *
 * The client is injected (no ioredis import at module load time) so:
 * - Tests can pass a fake client and verify behavior without a real server.
 * - Production code builds a real ioredis via `buildCache()` only when
 *   `QASE_MCP_REDIS_URL` is set, keeping the Redis code path off the hot path
 *   for stdio users.
 *
 * Values are JSON-encoded on write and decoded on read. Corrupted values in
 * Redis (e.g. from a manual debug SET) are treated as a miss rather than
 * throwing, so the cache never causes hard failures on the read path.
 */
export class RedisCache implements CacheBackend {
  constructor(private readonly client: RedisLikeClient) {}

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async deleteByPrefix(_prefix: string): Promise<void> {
    // Implemented in Task 6.
    throw new Error('RedisCache.deleteByPrefix: not implemented until Task 6');
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
