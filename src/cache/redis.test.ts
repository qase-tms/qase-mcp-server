import { RedisCache } from './redis.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { resetMetricsForTest, getMetrics } from './metrics.js';

interface FakeRedis {
  store: Map<string, string>;
  expiresAt: Map<string, number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttlMs: number): Promise<'OK'>;
  del(...keys: string[]): Promise<number>;
  scan(cursor: string, matchKey: string, pattern: string, countKey: string, count: number): Promise<[string, string[]]>;
  unlink(...keys: string[]): Promise<number>;
  quit(): Promise<'OK'>;
}

function makeFakeRedis(): FakeRedis {
  const store = new Map<string, string>();
  const expiresAt = new Map<string, number>();
  let scanSnapshot: string[] = [];

  const purgeExpired = (key: string): boolean => {
    const exp = expiresAt.get(key);
    if (exp !== undefined && exp <= Date.now()) {
      store.delete(key);
      expiresAt.delete(key);
      return true;
    }
    return false;
  };

  return {
    store,
    expiresAt,
    async get(key) {
      purgeExpired(key);
      return store.has(key) ? (store.get(key) as string) : null;
    },
    async set(key, value, _mode, ttlMs) {
      store.set(key, value);
      expiresAt.set(key, Date.now() + ttlMs);
      return 'OK';
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) {
        if (store.delete(k)) n++;
        expiresAt.delete(k);
      }
      return n;
    },
    async scan(cursor, _m, pattern, _c, count) {
      const re = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      // Snapshot all keys at the start of a new scan (cursor === '0').
      // Re-use the same snapshot on subsequent pages so that deletions
      // during iteration don't shift the positional cursor.
      const start = Number(cursor) || 0;
      if (start === 0) {
        scanSnapshot = Array.from(store.keys());
      }
      const end = start + count;
      const page = scanSnapshot.slice(start, end);
      const slice = page.filter((k) => re.test(k));
      const nextCursor = end >= scanSnapshot.length ? '0' : String(end);
      return [nextCursor, slice];
    },
    async unlink(...keys) {
      return this.del(...keys);
    },
    async quit() {
      return 'OK';
    },
  };
}

describe('RedisCache — basic ops', () => {
  it('round-trips a JSON-serializable value', async () => {
    const fake = makeFakeRedis();
    const cache = new RedisCache(fake as any);
    await cache.set('k', { a: 1, b: 'x' }, 60_000);
    expect(await cache.get('k')).toEqual({ a: 1, b: 'x' });
    await cache.close();
  });

  it('returns undefined on miss', async () => {
    const fake = makeFakeRedis();
    const cache = new RedisCache(fake as any);
    expect(await cache.get('missing')).toBeUndefined();
    await cache.close();
  });

  it('respects TTL (Redis PX mode)', async () => {
    const fake = makeFakeRedis();
    const cache = new RedisCache(fake as any);
    await cache.set('k', 'v', 10);
    await new Promise((r) => setTimeout(r, 20));
    expect(await cache.get('k')).toBeUndefined();
    await cache.close();
  });

  it('deletes a single key', async () => {
    const fake = makeFakeRedis();
    const cache = new RedisCache(fake as any);
    await cache.set('k', 'v', 60_000);
    await cache.delete('k');
    expect(await cache.get('k')).toBeUndefined();
    await cache.close();
  });

  it('treats non-JSON values from storage as a miss (defensive against data corruption)', async () => {
    const fake = makeFakeRedis();
    fake.store.set('bad', '{not-json'); // simulate corrupted entry
    fake.expiresAt.set('bad', Date.now() + 60_000);
    const cache = new RedisCache(fake as any);
    expect(await cache.get('bad')).toBeUndefined();
    await cache.close();
  });

  it('close() calls quit() on the underlying client', async () => {
    const fake = makeFakeRedis();
    const quitSpy = jest.spyOn(fake, 'quit');
    const cache = new RedisCache(fake as any);
    await cache.close();
    expect(quitSpy).toHaveBeenCalled();
  });
});

describe('RedisCache — deleteByPrefix', () => {
  it('removes every entry whose key matches `${prefix}*` across SCAN pages', async () => {
    const fake = makeFakeRedis();
    const cache = new RedisCache(fake as any);
    for (let i = 0; i < 250; i++) {
      await cache.set(`v1:h:tenantA:r${i}::`, i, 60_000);
    }
    await cache.set('v1:h:tenantB:r1::', 'B', 60_000);

    await cache.deleteByPrefix('v1:h:tenantA:');

    for (let i = 0; i < 250; i++) {
      expect(await cache.get(`v1:h:tenantA:r${i}::`)).toBeUndefined();
    }
    expect(await cache.get('v1:h:tenantB:r1::')).toBe('B');
    await cache.close();
  });

  it('no-ops when the prefix matches nothing', async () => {
    const fake = makeFakeRedis();
    const cache = new RedisCache(fake as any);
    await cache.set('v1:h:tenantA:r1::', 1, 60_000);
    await cache.deleteByPrefix('v1:h:tenantZ:');
    expect(await cache.get('v1:h:tenantA:r1::')).toBe(1);
    await cache.close();
  });
});

describe('RedisCache — resilience', () => {
  beforeEach(() => resetMetricsForTest());
  afterEach(() => resetMetricsForTest());

  it('returns undefined (miss) on a GET error instead of throwing', async () => {
    const failing = makeFakeRedis();
    failing.get = async () => {
      throw new Error('network');
    };
    const cache = new RedisCache(failing as any);
    expect(await cache.get('k')).toBeUndefined();
    expect(getMetrics().getCounter('qase_mcp_cache_errors_total', { tier: 'l2' })).toBe(1);
  });

  it('swallows SET errors silently', async () => {
    const failing = makeFakeRedis();
    failing.set = async () => {
      throw new Error('network');
    };
    const cache = new RedisCache(failing as any);
    await expect(cache.set('k', 'v', 1000)).resolves.toBeUndefined();
    expect(getMetrics().getCounter('qase_mcp_cache_errors_total', { tier: 'l2' })).toBe(1);
  });

  it('increments l2 hits and misses', async () => {
    const fake = makeFakeRedis();
    const cache = new RedisCache(fake as any);
    await cache.set('k', 'v', 60_000);
    await cache.get('k'); // hit
    await cache.get('nope'); // miss
    expect(getMetrics().getCounter('qase_mcp_cache_hits_total', { tier: 'l2' })).toBe(1);
    expect(getMetrics().getCounter('qase_mcp_cache_misses_total', { tier: 'l2' })).toBe(1);
  });

  it('short-circuits once CB opens after repeated failures', async () => {
    const failing = makeFakeRedis();
    failing.get = async () => {
      throw new Error('network');
    };
    const cb = new CircuitBreaker({ name: 'redis', failureThreshold: 3, openDurationMs: 1000 });
    const cache = new RedisCache(failing as any, { circuitBreaker: cb });

    // Three real failures trip the breaker.
    await cache.get('k');
    await cache.get('k');
    await cache.get('k');
    expect(cb.state).toBe('open');

    // Fourth call is short-circuited: errors_total increments, but no call to underlying client
    const spy = jest.spyOn(failing, 'get');
    await cache.get('k');
    expect(spy).not.toHaveBeenCalled();
    expect(getMetrics().getCounter('qase_mcp_cache_errors_total', { tier: 'l2' })).toBeGreaterThanOrEqual(4);
  });
});
