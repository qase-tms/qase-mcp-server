import { CacheBackend } from './types.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { getMetrics } from './metrics.js';

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

export interface RedisCacheOptions {
  circuitBreaker?: CircuitBreaker;
}

/**
 * Redis-backed CacheBackend with graceful degradation.
 *
 * All upstream calls run through an optional circuit breaker. On any failure
 * the breaker records it, the qase_mcp_cache_errors_total{tier="l2"} counter
 * increments, and the read path returns undefined (miss). Write paths swallow
 * errors so the caller is never blocked on a Redis outage.
 */
export class RedisCache implements CacheBackend {
  private readonly cb: CircuitBreaker;

  constructor(
    private readonly client: RedisLikeClient,
    opts: RedisCacheOptions = {},
  ) {
    this.cb =
      opts.circuitBreaker ??
      new CircuitBreaker({
        name: 'redis',
        failureThreshold: 5,
        openDurationMs: 30_000,
        onStateChange: (s) =>
          getMetrics().setGauge(
            'qase_mcp_circuit_breaker_state',
            { name: 'redis' },
            s === 'closed' ? 0 : s === 'half_open' ? 1 : 2,
          ),
      });
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.cb.exec(() => this.client.get(key));
      if (raw === null) {
        getMetrics().incCounter('qase_mcp_cache_misses_total', { tier: 'l2' });
        return undefined;
      }
      try {
        const v = JSON.parse(raw) as T;
        getMetrics().incCounter('qase_mcp_cache_hits_total', { tier: 'l2' });
        return v;
      } catch {
        getMetrics().incCounter('qase_mcp_cache_misses_total', { tier: 'l2' });
        return undefined;
      }
    } catch {
      getMetrics().incCounter('qase_mcp_cache_errors_total', { tier: 'l2' });
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    try {
      await this.cb.exec(() => this.client.set(key, JSON.stringify(value), 'PX', ttlMs));
    } catch {
      getMetrics().incCounter('qase_mcp_cache_errors_total', { tier: 'l2' });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.cb.exec(() => this.client.del(key).then(() => undefined));
    } catch {
      getMetrics().incCounter('qase_mcp_cache_errors_total', { tier: 'l2' });
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    try {
      await this.cb.exec(async () => {
        const pattern = `${prefix}*`;
        let cursor = '0';
        do {
          const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
          if (keys.length > 0) await this.client.unlink(...keys);
          cursor = next;
        } while (cursor !== '0');
      });
    } catch {
      getMetrics().incCounter('qase_mcp_cache_errors_total', { tier: 'l2' });
    }
  }

  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      // best-effort on shutdown
    }
  }
}
