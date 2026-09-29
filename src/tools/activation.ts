import type { Redis } from 'ioredis';

/** How long an activation survives without being refreshed. */
export const ACTIVATION_TTL_SECONDS = 3600;

/**
 * Which tools a given caller has switched on with qase_discover_tools.
 *
 * This used to be a process-wide Set on the registry, which had two problems:
 * one caller's discovery was visible to every other caller, and nothing
 * survived across replicas. Keying it by the token subject fixes both.
 *
 * Losing an activation is not fatal — the agent calls qase_discover_tools
 * again — so every failure path here degrades rather than throws.
 */
export interface ToolActivationStore {
  get(subject: string): Promise<Set<string>>;
  /** Returns the names that were not already active for this subject. */
  add(subject: string, names: string[]): Promise<string[]>;
}

export class MemoryActivationStore implements ToolActivationStore {
  private readonly entries = new Map<string, { names: Set<string>; expiresAtMs: number }>();
  /** Overridable so the ttl can be tested without sleeping. */
  nowMs: () => number = () => Date.now();

  constructor(private readonly ttlSeconds: number = ACTIVATION_TTL_SECONDS) {}

  async get(subject: string): Promise<Set<string>> {
    const entry = this.entries.get(subject);
    if (!entry) return new Set();
    if (entry.expiresAtMs <= this.nowMs()) {
      this.entries.delete(subject);
      return new Set();
    }
    return new Set(entry.names);
  }

  async add(subject: string, names: string[]): Promise<string[]> {
    const current = await this.get(subject);
    const added = names.filter((n) => !current.has(n));
    for (const n of names) current.add(n);
    this.entries.set(subject, {
      names: current,
      expiresAtMs: this.nowMs() + this.ttlSeconds * 1000,
    });
    return added;
  }
}

/**
 * Redis-backed activation, shared across replicas.
 *
 * Every method swallows Redis failures and answers as if the subject had
 * nothing activated: a dead cache must not take the server down with it. The
 * caller sees an agent that has to run discovery again, not an error.
 */
export class RedisActivationStore implements ToolActivationStore {
  constructor(
    private readonly client: Pick<Redis, 'smembers' | 'sadd' | 'expire'>,
    private readonly ttlSeconds: number = ACTIVATION_TTL_SECONDS,
  ) {}

  private key(subject: string): string {
    return `mcp:tools:active:${subject}`;
  }

  async get(subject: string): Promise<Set<string>> {
    try {
      return new Set(await this.client.smembers(this.key(subject)));
    } catch (err) {
      console.error('[Activation] Redis read failed, treating as empty:', err);
      return new Set();
    }
  }

  async add(subject: string, names: string[]): Promise<string[]> {
    if (names.length === 0) return [];

    // Computed outside any try block: a bug in this pure filter must never be
    // reported as a Redis failure.
    const before = await this.get(subject);
    const added = names.filter((n) => !before.has(n));

    try {
      await this.client.sadd(this.key(subject), ...names);
    } catch (err) {
      // Nothing was recorded, so the caller has to re-announce everything —
      // not just the names we computed as "new".
      console.error('[Activation] Redis write failed, activation not shared:', err);
      return names;
    }

    try {
      await this.client.expire(this.key(subject), this.ttlSeconds);
    } catch (err) {
      // The activation IS recorded at this point (sadd succeeded), so the
      // return value is still `added`. The key is just missing its ttl until
      // the next successful add for this subject sets one.
      console.error(
        '[Activation] Redis expire failed after a successful write; key has no ttl until the next add:',
        err,
      );
    }

    return added;
  }
}

/**
 * Wrap a promise for "the real store, once it's ready" so callers can be
 * handed a `ToolActivationStore` synchronously: `get`/`add` await `ready`
 * internally, so a call that arrives before it settles is queued behind it
 * rather than lost, and every call — during the wait and after — is served
 * by whatever `ready` finally resolves to, `fallback` included if it
 * rejects.
 *
 * Exported as a seam: it is the only novel behaviour in this module that
 * isn't otherwise reachable without exercising a real (or faked) dynamic
 * `import('ioredis')`, so tests construct `ready` directly instead of going
 * through createRedisActivationStore.
 */
export function createForwardingActivationStore(
  ready: Promise<ToolActivationStore>,
  fallback: ToolActivationStore = new MemoryActivationStore(),
): ToolActivationStore {
  const settled = ready.catch(() => fallback);

  return {
    async get(subject: string): Promise<Set<string>> {
      const store = await settled;
      return store.get(subject);
    },
    async add(subject: string, names: string[]): Promise<string[]> {
      const store = await settled;
      return store.add(subject, names);
    },
  };
}

/**
 * Build a Redis-backed store for the given URL, following the same
 * optional-dependency convention as src/cache/index.ts: `ioredis` is
 * dynamically imported only when a URL is actually configured (stdio users
 * never load it), and a missing package or a construction failure falls back
 * to the in-process store instead of throwing.
 *
 * createActivationStore itself must stay synchronous (callers rely on
 * getting a store back immediately, and the no-Redis-URL branch is tested as
 * such), so the dynamic import happens in the background via
 * createForwardingActivationStore.
 */
function createRedisActivationStore(url: string): ToolActivationStore {
  const fallback = new MemoryActivationStore();

  const ready: Promise<ToolActivationStore> = (async () => {
    let RedisCtor: any;
    try {
      const mod = await import('ioredis');
      RedisCtor = mod.default ?? mod.Redis;
    } catch (err) {
      console.error(
        '[Activation] QASE_MCP_REDIS_URL is set but the optional `ioredis` dependency is not installed. ' +
          'Falling back to in-memory activation store.',
        err,
      );
      return fallback;
    }

    try {
      const client: Redis = new RedisCtor(url, {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        enableOfflineQueue: false,
        connectTimeout: 3000,
        commandTimeout: 2000,
      });
      return new RedisActivationStore(client);
    } catch (err) {
      console.error(
        '[Activation] Failed to construct the Redis client. Falling back to in-memory activation store.',
        err,
      );
      return fallback;
    }
  })();

  return createForwardingActivationStore(ready, fallback);
}

// `typeof process.env` rather than the literal `NodeJS.ProcessEnv` type:
// identical type (that's how @types/node types `process.env`), but written
// this way it doesn't reference the ambient `NodeJS` global by name, which
// this project's eslint config (core `no-undef`, not type-aware) does not
// recognise.
export function createActivationStore(env: typeof process.env = process.env): ToolActivationStore {
  const url = env.QASE_MCP_REDIS_URL;
  if (!url) return new MemoryActivationStore();
  return createRedisActivationStore(url);
}

/** Built on first use by {@link getActivationStore}; see why it is not eager. */
let processStore: ToolActivationStore | undefined;

/**
 * The one activation store this process reads and writes.
 *
 * `server.ts` (reading the active set for tools/list) and `discover.ts`
 * (adding to it) must see the same state and, when Redis is configured, the
 * same connection — hence a process singleton rather than one store per
 * importer.
 *
 * It is LAZY because importing a module must not open sockets. Built eagerly,
 * every stdio process with QASE_MCP_REDIS_URL set connected an ioredis client
 * it can never use, and that handle can hold the process open past the stdin
 * close the SDK's stdio transport otherwise shuts down cleanly on. The server
 * event bus is lazy for exactly this reason; see getServerEventBus().
 */
export function getActivationStore(): ToolActivationStore {
  processStore ??= createActivationStore();
  return processStore;
}
