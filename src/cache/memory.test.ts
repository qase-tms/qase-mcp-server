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
