import { CacheBackend, InvalidationBus } from './types.js';

interface L2Envelope<T> {
  v: T;
  /** Absolute epoch ms when the entry expires. */
  exp: number;
}

/**
 * Composite cache with L1 (process-local) + L2 (shared, typically Redis) and
 * an InvalidationBus for cross-instance L1 coherence.
 *
 * Read: L1 → L2 → miss. L2 hits are promoted to L1 with the *remaining* TTL,
 * not a fresh TTL — this prevents resurrecting near-expired data forever
 * after a chain of L2→L1 promotions across a fleet.
 *
 * Write: parallel L1 + L2. Values written to L2 are wrapped in an envelope
 * `{v, exp}` so `exp` (absolute time) survives TTL-bounded native storage
 * and can be used to compute promotion TTL.
 *
 * Invalidation: local L1 + L2 delete, then `bus.publish(prefix)`. Other
 * instances' subscribers evict the matching L1 entries.
 */
export class LayeredCache implements CacheBackend {
  constructor(
    private readonly l1: CacheBackend,
    private readonly l2: CacheBackend,
    private readonly bus: InvalidationBus,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const fromL1 = await this.l1.get<T>(key);
    if (fromL1 !== undefined) return fromL1;

    const env = await this.l2.get<L2Envelope<T>>(key);
    if (env === undefined || env.v === undefined || env.exp === undefined) return undefined;

    const remaining = env.exp - Date.now();
    if (remaining <= 0) return undefined;

    await this.l1.set(key, env.v, remaining);
    return env.v;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const envelope: L2Envelope<T> = { v: value, exp: Date.now() + ttlMs };
    const results = await Promise.allSettled([
      this.l1.set(key, value, ttlMs),
      this.l2.set(key, envelope, ttlMs),
    ]);
    const l1Result = results[0];
    if (l1Result.status === 'rejected') throw l1Result.reason;
  }

  async delete(_key: string): Promise<void> {
    throw new Error('LayeredCache.delete: not implemented until Task 11');
  }

  async deleteByPrefix(_prefix: string): Promise<void> {
    throw new Error('LayeredCache.deleteByPrefix: not implemented until Task 11');
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.l1.close(), this.l2.close(), this.bus.close()]);
  }
}
