import { LayeredCache } from './layered.js';
import { InMemoryCache } from './memory.js';
import { RedisCache } from './redis.js';
import { RedisInvalidationBus } from './redis-bus.js';

const REDIS_URL = process.env.REDIS_TEST_URL;
const CHANNEL = `qase-mcp:test:${Math.random().toString(36).slice(2)}`;

const describeIfRedis = REDIS_URL ? describe : describe.skip;

describeIfRedis('LayeredCache integration (two instances, shared Redis)', () => {
  let Redis: any;
  const clients: any[] = [];

  beforeAll(async () => {
    const mod = await import('ioredis');
    Redis = mod.default ?? (mod as any).Redis;
  });

  afterEach(async () => {
    await Promise.allSettled(clients.map((c) => c.quit()));
    clients.length = 0;
  });

  function buildInstance(): LayeredCache {
    const l1 = new InMemoryCache({ maxEntries: 100, maxPerTenant: 50, sweepIntervalMs: 0 });
    const l2Client = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
    const pub = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
    const sub = new Redis(REDIS_URL, { maxRetriesPerRequest: 3 });
    clients.push(l2Client, pub, sub);
    const l2 = new RedisCache(l2Client);
    const bus = new RedisInvalidationBus(pub, sub, CHANNEL);
    return new LayeredCache(l1, l2, bus);
  }

  it('invalidation on instance A evicts L1 on instance B', async () => {
    const a = buildInstance();
    const b = buildInstance();
    await (a as any).ready();
    await (b as any).ready();

    const key = `v1:h:tenantA:r-${Math.random()}::`;
    await a.set(key, 'hello', 60_000);

    // b reads → L1 miss → L2 hit → promote
    expect(await b.get(key)).toBe('hello');

    // a invalidates; b's L1 should drop
    await a.deleteByPrefix('v1:h:tenantA:');

    // Small yield to allow pub/sub delivery
    await new Promise((r) => setTimeout(r, 200));

    // b should not find the value in L1 anymore
    // (L2 was also cleared, so it's a full miss)
    expect(await b.get(key)).toBeUndefined();

    await a.close();
    await b.close();
  }, 10_000);
});
