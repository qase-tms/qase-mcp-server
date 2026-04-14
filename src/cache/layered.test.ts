import { CacheBackend } from './types.js';
import { LayeredCache } from './layered.js';

function makeSpyCache(): CacheBackend & {
  gets: string[];
  sets: Array<{ key: string; value: unknown; ttlMs: number }>;
  deletes: string[];
  prefixDeletes: string[];
  store: Map<string, { value: unknown; expiresAt: number }>;
} {
  const store = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    store,
    gets: [],
    sets: [],
    deletes: [],
    prefixDeletes: [],
    async get<T>(key: string) {
      this.gets.push(key);
      const e = store.get(key);
      if (!e) return undefined;
      if (e.expiresAt <= Date.now()) {
        store.delete(key);
        return undefined;
      }
      return e.value as T;
    },
    async set<T>(key: string, value: T, ttlMs: number) {
      this.sets.push({ key, value, ttlMs });
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    async delete(key: string) {
      this.deletes.push(key);
      store.delete(key);
    },
    async deleteByPrefix(prefix: string) {
      this.prefixDeletes.push(prefix);
      for (const k of Array.from(store.keys())) if (k.startsWith(prefix)) store.delete(k);
    },
    async close() {
      store.clear();
    },
  };
}

function makeNoopBus() {
  const published: string[] = [];
  let handler: ((p: string) => void) | undefined;
  return {
    published,
    async publish(p: string) {
      published.push(p);
      handler?.(p);
    },
    async subscribe(h: (p: string) => void) {
      handler = h;
    },
    async close() {},
  };
}

describe('LayeredCache — read path', () => {
  it('returns the L1 value without touching L2 on hit', async () => {
    const l1 = makeSpyCache();
    const l2 = makeSpyCache();
    const bus = makeNoopBus();
    await l1.set('k', 'hello', 10_000);

    const cache = new LayeredCache(l1, l2, bus);
    const v = await cache.get('k');

    expect(v).toBe('hello');
    expect(l2.gets).toEqual([]);
    await cache.close();
  });

  it('falls through to L2 on L1 miss and promotes to L1 with remaining TTL', async () => {
    const l1 = makeSpyCache();
    const l2 = makeSpyCache();
    const bus = makeNoopBus();
    // Pre-populate L2 with the L2 envelope (as LayeredCache.set would)
    await l2.set('k', { v: { ok: true }, exp: Date.now() + 10_000 }, 10_000);

    const cache = new LayeredCache(l1, l2, bus);
    const v = await cache.get('k');

    expect(v).toEqual({ ok: true });
    expect(l1.sets).toHaveLength(1);
    expect(l1.sets[0].key).toBe('k');
    expect(l1.sets[0].value).toEqual({ ok: true });
    expect(l1.sets[0].ttlMs).toBeGreaterThan(0);
    expect(l1.sets[0].ttlMs).toBeLessThanOrEqual(10_000);
    await cache.close();
  });

  it('returns undefined on L1 miss + L2 miss', async () => {
    const l1 = makeSpyCache();
    const l2 = makeSpyCache();
    const bus = makeNoopBus();

    const cache = new LayeredCache(l1, l2, bus);
    expect(await cache.get('k')).toBeUndefined();
    await cache.close();
  });

  it('does not promote an L2 entry whose TTL has expired', async () => {
    const l1 = makeSpyCache();
    const l2 = makeSpyCache();
    const bus = makeNoopBus();
    // Envelope with already-expired TTL
    await l2.set('k', { v: 'stale', exp: Date.now() - 1000 }, 60_000);

    const cache = new LayeredCache(l1, l2, bus);
    expect(await cache.get('k')).toBeUndefined();
    expect(l1.sets).toHaveLength(0); // no promotion
    await cache.close();
  });
});

describe('LayeredCache — write path', () => {
  it('writes to both L1 and L2 in parallel', async () => {
    const l1 = makeSpyCache();
    const l2 = makeSpyCache();
    const bus = makeNoopBus();

    const cache = new LayeredCache(l1, l2, bus);
    await cache.set('k', 'v', 5000);

    expect(l1.sets).toHaveLength(1);
    expect(l1.sets[0]).toMatchObject({ key: 'k', value: 'v', ttlMs: 5000 });

    expect(l2.sets).toHaveLength(1);
    expect(l2.sets[0].key).toBe('k');
    expect(l2.sets[0].ttlMs).toBe(5000);
    const env = l2.sets[0].value as { v: unknown; exp: number };
    expect(env.v).toBe('v');
    expect(env.exp).toBeGreaterThan(Date.now() - 100);
    expect(env.exp).toBeLessThanOrEqual(Date.now() + 5000);

    await cache.close();
  });

  it('does not throw if L2 set fails (L1 still has the value)', async () => {
    const l1 = makeSpyCache();
    const l2 = makeSpyCache();
    l2.set = async () => { throw new Error('l2 down'); };
    const bus = makeNoopBus();

    const cache = new LayeredCache(l1, l2, bus);
    await expect(cache.set('k', 'v', 5000)).resolves.toBeUndefined();
    expect(await cache.get('k')).toBe('v');
    await cache.close();
  });
});
