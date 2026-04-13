import { RedisCache } from './redis.js';

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
    async scan(_cursor, _m, pattern, _c, _count) {
      const re = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      const matches = Array.from(store.keys()).filter((k) => re.test(k));
      return ['0', matches];
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
