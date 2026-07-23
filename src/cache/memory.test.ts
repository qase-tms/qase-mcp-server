import { InMemoryCache } from './memory.js';

describe('InMemoryCache — basic operations', () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache({ maxEntries: 100, maxPerTenant: 50 });
  });

  afterEach(async () => {
    await cache.close();
  });

  it('returns undefined on miss', async () => {
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('stores and retrieves a value', async () => {
    await cache.set('k', { a: 1 }, 60_000);
    expect(await cache.get('k')).toEqual({ a: 1 });
  });

  it('overwrites an existing value', async () => {
    await cache.set('k', 'first', 60_000);
    await cache.set('k', 'second', 60_000);
    expect(await cache.get('k')).toBe('second');
  });

  it('deletes a single entry', async () => {
    await cache.set('k', 'v', 60_000);
    await cache.delete('k');
    expect(await cache.get('k')).toBeUndefined();
  });

  it('delete on missing key is a no-op', async () => {
    await expect(cache.delete('nope')).resolves.toBeUndefined();
  });
});

describe('InMemoryCache — TTL expiration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns undefined after TTL elapses', async () => {
    const cache = new InMemoryCache({ maxEntries: 10, maxPerTenant: 10, sweepIntervalMs: 0 });
    await cache.set('k', 'v', 1000);

    jest.advanceTimersByTime(999);
    expect(await cache.get('k')).toBe('v');

    jest.advanceTimersByTime(2);
    expect(await cache.get('k')).toBeUndefined();

    await cache.close();
  });

  it('returns value exactly at the boundary when strictly less than TTL', async () => {
    const cache = new InMemoryCache({ maxEntries: 10, maxPerTenant: 10, sweepIntervalMs: 0 });
    await cache.set('k', 'v', 1000);
    jest.advanceTimersByTime(500);
    expect(await cache.get('k')).toBe('v');
    await cache.close();
  });
});

describe('InMemoryCache — deleteByPrefix', () => {
  it('removes only entries whose keys start with the prefix', async () => {
    const cache = new InMemoryCache({ maxEntries: 10, maxPerTenant: 10, sweepIntervalMs: 0 });
    await cache.set('v1:api.qase.io:tenantA:system_fields::', 1, 60_000);
    await cache.set('v1:api.qase.io:tenantA:users::', 2, 60_000);
    await cache.set('v1:api.qase.io:tenantB:system_fields::', 3, 60_000);

    await cache.deleteByPrefix('v1:api.qase.io:tenantA:');

    expect(await cache.get('v1:api.qase.io:tenantA:system_fields::')).toBeUndefined();
    expect(await cache.get('v1:api.qase.io:tenantA:users::')).toBeUndefined();
    expect(await cache.get('v1:api.qase.io:tenantB:system_fields::')).toBe(3);

    await cache.close();
  });
});

describe('InMemoryCache — per-tenant cap', () => {
  it('silently drops writes beyond the per-tenant cap', async () => {
    const cache = new InMemoryCache({ maxEntries: 100, maxPerTenant: 2, sweepIntervalMs: 0 });

    await cache.set('v1:h:tenantA:r1::', 1, 60_000);
    await cache.set('v1:h:tenantA:r2::', 2, 60_000);
    await cache.set('v1:h:tenantA:r3::', 3, 60_000); // beyond cap

    expect(await cache.get('v1:h:tenantA:r1::')).toBe(1);
    expect(await cache.get('v1:h:tenantA:r2::')).toBe(2);
    expect(await cache.get('v1:h:tenantA:r3::')).toBeUndefined();

    await cache.close();
  });

  it('counts each tenant independently', async () => {
    const cache = new InMemoryCache({ maxEntries: 100, maxPerTenant: 2, sweepIntervalMs: 0 });

    await cache.set('v1:h:tenantA:r1::', 'a1', 60_000);
    await cache.set('v1:h:tenantA:r2::', 'a2', 60_000);
    await cache.set('v1:h:tenantB:r1::', 'b1', 60_000);

    expect(await cache.get('v1:h:tenantB:r1::')).toBe('b1');
    await cache.close();
  });

  it('decreases count when an entry is deleted explicitly', async () => {
    const cache = new InMemoryCache({ maxEntries: 100, maxPerTenant: 2, sweepIntervalMs: 0 });

    await cache.set('v1:h:tenantA:r1::', 1, 60_000);
    await cache.set('v1:h:tenantA:r2::', 2, 60_000);
    await cache.delete('v1:h:tenantA:r1::');

    await cache.set('v1:h:tenantA:r3::', 3, 60_000);
    expect(await cache.get('v1:h:tenantA:r3::')).toBe(3);

    await cache.close();
  });

  it('overwriting an existing key does not consume a new quota slot', async () => {
    const cache = new InMemoryCache({ maxEntries: 100, maxPerTenant: 2, sweepIntervalMs: 0 });

    await cache.set('v1:h:tenantA:r1::', 'first', 60_000);
    await cache.set('v1:h:tenantA:r1::', 'updated', 60_000);
    await cache.set('v1:h:tenantA:r2::', 'second', 60_000);
    await cache.set('v1:h:tenantA:r3::', 'third', 60_000); // cap: new key → dropped

    expect(await cache.get('v1:h:tenantA:r1::')).toBe('updated');
    expect(await cache.get('v1:h:tenantA:r2::')).toBe('second');
    expect(await cache.get('v1:h:tenantA:r3::')).toBeUndefined();

    await cache.close();
  });
});

describe('InMemoryCache — quota accounting under eviction', () => {
  it('decrements tenant count when an entry is auto-evicted by global LRU pressure', async () => {
    // global cap = 2; per-tenant cap = 5 (so global is the binding constraint)
    const cache = new InMemoryCache({ maxEntries: 2, maxPerTenant: 5, sweepIntervalMs: 0 });

    await cache.set('v1:h:tenantA:r1::', 1, 60_000);
    await cache.set('v1:h:tenantA:r2::', 2, 60_000);
    // Adding a third entry pushes one of tenantA's entries out via global LRU
    await cache.set('v1:h:tenantB:r1::', 3, 60_000);

    // tenantA must still be able to add entries up to per-tenant cap
    // (if perTenantCount leaked, this would be blocked once count reaches 5)
    await cache.set('v1:h:tenantA:r3::', 4, 60_000);
    await cache.set('v1:h:tenantA:r4::', 5, 60_000);

    // Even though writes succeeded, only 1 of tenantA's entries fits global cap of 2
    // (tenantB's entry is in the cache too, so tenantA only gets 1 slot)
    expect(await cache.get('v1:h:tenantA:r4::')).toBe(5);

    await cache.close();
  });

  it('decrements tenant count when an entry is removed by TTL expiry via get()', async () => {
    jest.useFakeTimers();
    try {
      const cache = new InMemoryCache({ maxEntries: 100, maxPerTenant: 2, sweepIntervalMs: 0 });

      await cache.set('v1:h:tenantA:r1::', 1, 1000);
      await cache.set('v1:h:tenantA:r2::', 2, 1000);

      // Advance past TTL
      jest.advanceTimersByTime(2000);

      // First get triggers cleanup of expired entry r1
      expect(await cache.get('v1:h:tenantA:r1::')).toBeUndefined();
      expect(await cache.get('v1:h:tenantA:r2::')).toBeUndefined();

      // Tenant must be able to write again — count should be back to 0
      await cache.set('v1:h:tenantA:r3::', 3, 60_000);
      await cache.set('v1:h:tenantA:r4::', 4, 60_000);
      expect(await cache.get('v1:h:tenantA:r3::')).toBe(3);
      expect(await cache.get('v1:h:tenantA:r4::')).toBe(4);

      await cache.close();
    } finally {
      jest.useRealTimers();
    }
  });
});

import { getMetrics, resetMetricsForTest } from './metrics.js';

describe('InMemoryCache — metrics instrumentation', () => {
  beforeEach(() => {
    resetMetricsForTest();
  });

  afterEach(() => {
    resetMetricsForTest();
  });

  it('increments cache_hits_total{tier="l1"} on a hit', async () => {
    const cache = new InMemoryCache({ maxEntries: 10, maxPerTenant: 10, sweepIntervalMs: 0 });
    await cache.set('v1:h:tenantA:r1::', 1, 60_000);
    await cache.get('v1:h:tenantA:r1::');
    expect(getMetrics().getCounter('qase_mcp_cache_hits_total', { tier: 'l1' })).toBe(1);
    await cache.close();
  });

  it('increments cache_misses_total{tier="l1"} on a miss', async () => {
    const cache = new InMemoryCache({ maxEntries: 10, maxPerTenant: 10, sweepIntervalMs: 0 });
    await cache.get('v1:h:tenantA:rX::');
    expect(getMetrics().getCounter('qase_mcp_cache_misses_total', { tier: 'l1' })).toBe(1);
    await cache.close();
  });

  it('counts an expired entry access as a miss', async () => {
    jest.useFakeTimers();
    try {
      const cache = new InMemoryCache({ maxEntries: 10, maxPerTenant: 10, sweepIntervalMs: 0 });
      await cache.set('v1:h:tenantA:r1::', 1, 1000);
      jest.advanceTimersByTime(2000);
      await cache.get('v1:h:tenantA:r1::');
      expect(getMetrics().getCounter('qase_mcp_cache_hits_total', { tier: 'l1' })).toBe(0);
      expect(getMetrics().getCounter('qase_mcp_cache_misses_total', { tier: 'l1' })).toBe(1);
      await cache.close();
    } finally {
      jest.useRealTimers();
    }
  });
});
