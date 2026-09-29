import type { ServerEvent, ServerEventBus } from '@modelcontextprotocol/server';

/** Minimal surface this module needs from an ioredis-like publisher. */
export interface RedisLikePub {
  publish(channel: string, message: string): Promise<number>;
}

/** Minimal surface this module needs from an ioredis-like subscriber. */
export interface RedisLikeSub {
  subscribe(channel: string): Promise<number>;
  on(event: 'message', handler: (channel: string, message: string) => void): this;
}

const DEFAULT_CHANNEL = 'mcp:server-events';

/**
 * ServerEventBus over Redis Pub/Sub.
 *
 * In the modern era `notifications/tools/list_changed` (and its siblings) are
 * not pushed by the server on its own: clients open a `subscriptions/listen`
 * stream and `createMcpHandler` registers a listener via `bus.subscribe()`;
 * consumer code publishes change events via `bus.publish()`. Across replicas
 * that has to fan out somewhere shared, or a client listening on one pod
 * never hears about a change made on another — hence Redis.
 *
 * `publish()` on the `ServerEventBus` interface is synchronous, but a Redis
 * publish is not. Local delivery happens synchronously in `publish()` itself
 * (so a single-replica deployment never depends on Redis at all); the
 * network fan-out to `pub` is fire-and-forget in the background, following
 * `RedisInvalidationBus`'s tolerance: a failed remote publish is logged and
 * swallowed rather than thrown, since a dead cross-replica link must not take
 * down local delivery.
 *
 * Message format on the wire is the JSON-serialised `ServerEvent`. Malformed
 * messages are dropped silently in `onRemoteMessage` — same reasoning as
 * `RedisInvalidationBus`: one bad publisher must not poison the subscription
 * for every other listener.
 */
export class RedisServerEventBus implements ServerEventBus {
  private readonly listeners = new Set<(event: ServerEvent) => void>();

  constructor(
    private readonly pub: RedisLikePub,
    private readonly channel: string = DEFAULT_CHANNEL,
  ) {}

  publish(event: ServerEvent): void {
    this.deliver(event);

    void this.pub.publish(this.channel, JSON.stringify(event)).catch((err) => {
      console.error('[EventBus] Redis publish failed; other replicas will miss this event:', err);
    });
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  /**
   * Deliver a message that arrived on the Redis channel to local listeners.
   * Wired up by whoever owns the subscriber client (see
   * `createServerEventBus` below); exposed here so it can be exercised
   * directly without a real Redis connection.
   */
  onRemoteMessage(message: string): void {
    let event: ServerEvent;
    try {
      event = JSON.parse(message) as ServerEvent;
    } catch {
      return;
    }
    this.deliver(event);
  }

  private deliver(event: ServerEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[EventBus] a subscriber threw during dispatch:', err);
      }
    }
  }
}

/**
 * Build a Redis-backed bus for the given URL, following the same
 * optional-dependency convention as `src/cache/index.ts` and
 * `src/tools/activation.ts`: `ioredis` is dynamically imported only when a
 * URL is actually configured, and any failure (missing package, bad
 * connection) degrades to "the bus just doesn't fan out across replicas"
 * rather than throwing.
 *
 * `createServerEventBus` itself must stay synchronous — `createMcpHandler`
 * takes its `bus` option up front — so the dynamic import and the real Redis
 * connection happen in the background. The `RedisServerEventBus` returned is
 * already fully usable for local pub/sub the moment it's constructed; only
 * the cross-replica fan-out (the `pub`'s network call, and the subscriber
 * wiring below) is caught up asynchronously.
 */
function createRedisServerEventBus(url: string): ServerEventBus {
  const channel = DEFAULT_CHANNEL;

  const ready: Promise<{ pub: RedisLikePub; sub: RedisLikeSub } | undefined> = (async () => {
    let RedisCtor: any;
    try {
      const mod = await import('ioredis');
      RedisCtor = mod.default ?? mod.Redis;
    } catch (err) {
      console.error(
        '[EventBus] QASE_MCP_REDIS_URL is set but the optional `ioredis` dependency is not installed. ' +
          'Falling back to in-process-only event delivery.',
        err,
      );
      return undefined;
    }

    try {
      const commandOpts = {
        maxRetriesPerRequest: 1,
        enableReadyCheck: true,
        enableOfflineQueue: false,
        connectTimeout: 3000,
        commandTimeout: 2000,
      };
      // The subscriber keeps its offline queue so (re)subscribe survives
      // reconnects and cross-replica delivery resumes once Redis is back.
      const subOpts = { maxRetriesPerRequest: 1, enableReadyCheck: true, connectTimeout: 3000 };
      const pubClient = new RedisCtor(url, commandOpts);
      const subClient = new RedisCtor(url, subOpts);
      return { pub: pubClient, sub: subClient };
    } catch (err) {
      console.error(
        '[EventBus] Failed to construct the Redis client. Falling back to in-process-only event delivery.',
        err,
      );
      return undefined;
    }
  })();

  // A `pub` whose `publish` awaits the real client once it's ready. Until
  // then (or if it never arrives), remote fan-out is a no-op — local
  // delivery in `RedisServerEventBus.publish` never depends on this.
  const pub: RedisLikePub = {
    async publish(ch: string, message: string): Promise<number> {
      const clients = await ready;
      if (!clients) return 0;
      return clients.pub.publish(ch, message);
    },
  };

  const bus = new RedisServerEventBus(pub, channel);

  void ready.then((clients) => {
    if (!clients) return;
    clients.sub.on('message', (msgChannel: string, message: string) => {
      if (msgChannel !== channel) return;
      bus.onRemoteMessage(message);
    });
    void clients.sub.subscribe(channel).catch((err) => {
      console.error(
        '[EventBus] Failed to subscribe to the Redis channel; remote events will not be delivered:',
        err,
      );
    });
  });

  return bus;
}

/**
 * Build the process-wide `ServerEventBus`, or `undefined` when Redis isn't
 * configured — in which case `createMcpHandler` falls back to its own
 * `InMemoryServerEventBus`, which is correct for a single-replica deployment
 * but not across replicas.
 */
export function createServerEventBus(
  env: typeof process.env = process.env,
): ServerEventBus | undefined {
  const url = env.QASE_MCP_REDIS_URL;
  if (!url) return undefined;
  return createRedisServerEventBus(url);
}
