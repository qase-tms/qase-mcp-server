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
