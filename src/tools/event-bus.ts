import { randomUUID } from 'node:crypto';
import { InMemoryServerEventBus } from '@modelcontextprotocol/server';
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
 * Wire envelope this bus publishes: the event plus the id of the instance
 * that published it. The `origin` field exists solely so `onRemoteMessage`
 * can recognise — and drop — a message this same instance just published to
 * itself (see the class doc comment below).
 */
interface WireMessage {
  origin: string;
  event: ServerEvent;
}

function isWireMessage(value: unknown): value is WireMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'origin' in value &&
    typeof (value as { origin: unknown }).origin === 'string' &&
    'event' in value
  );
}

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
 * Redis delivers a published message to every subscriber of the channel,
 * including the one belonging to the very process that published it (pub and
 * sub are two client objects, but the same server-side channel). Without
 * countermeasures that means a locally-published event gets delivered twice
 * on the publishing replica: once synchronously in `publish()`, once more
 * when the message round-trips back through `onRemoteMessage`. Each
 * outgoing message is therefore stamped with a random `origin` id generated
 * once per bus instance, and `onRemoteMessage` drops any message whose
 * `origin` matches its own — the loop-back copy is discarded, every other
 * replica still receives and delivers it normally. (This is unrelated to the
 * SDK's re-entrancy rule that a bus must not echo an event back to the
 * listener that is *currently* publishing it from inside `subscribe()` — the
 * default `InMemoryServerEventBus` never has listeners publish, and neither
 * does this one; the issue here is purely Redis fan-out delivering our own
 * publish back to us on a different call stack.)
 *
 * Message format on the wire is the JSON-serialised `WireMessage`. A message
 * that doesn't look like a `WireMessage` (no recognisable `origin`/`event`
 * envelope — e.g. a bare event, or garbage from a differently-shaped
 * publisher) is delivered as-is rather than dropped: `onRemoteMessage` only
 * has enough information to de-duplicate our *own* echoes, not to validate
 * the shape of an arbitrary remote payload. Genuinely malformed JSON is
 * dropped silently — same reasoning as `RedisInvalidationBus`: one bad
 * publisher must not poison the subscription for every other listener.
 */
export class RedisServerEventBus implements ServerEventBus {
  private readonly listeners = new Set<(event: ServerEvent) => void>();
  private readonly instanceId = randomUUID();

  constructor(
    private readonly pub: RedisLikePub,
    private readonly channel: string = DEFAULT_CHANNEL,
  ) {}

  publish(event: ServerEvent): void {
    this.deliver(event);

    const wire: WireMessage = { origin: this.instanceId, event };
    void this.pub.publish(this.channel, JSON.stringify(wire)).catch((err) => {
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
   * `wireRemoteSubscription` below); exposed here so it can be exercised
   * directly without a real Redis connection.
   */
  onRemoteMessage(message: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }

    if (isWireMessage(parsed)) {
      if (parsed.origin === this.instanceId) return; // our own publish, echoed back by Redis
      this.deliver(parsed.event);
      return;
    }

    this.deliver(parsed as ServerEvent);
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
    wireRemoteSubscription(clients.sub, bus, channel);
  });

  return bus;
}

/**
 * Register the Redis message handler that feeds `bus.onRemoteMessage` and
 * subscribe `sub` to `channel`.
 *
 * Exported as a seam: this is the piece that isn't otherwise reachable
 * without exercising a real (or faked) dynamic `import('ioredis')`, so tests
 * construct a fake `sub` directly instead of going through
 * createServerEventBus.
 */
export function wireRemoteSubscription(
  sub: RedisLikeSub,
  bus: RedisServerEventBus,
  channel: string = DEFAULT_CHANNEL,
): void {
  sub.on('message', (msgChannel: string, message: string) => {
    if (msgChannel !== channel) return;
    bus.onRemoteMessage(message);
  });
  void sub.subscribe(channel).catch((err) => {
    console.error(
      '[EventBus] Failed to subscribe to the Redis channel; remote events will not be delivered:',
      err,
    );
  });
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

/** Built on first use by {@link getServerEventBus}; see why it is not eager. */
let processBus: ServerEventBus | undefined;

/**
 * The one bus this process publishes onto and serves `subscriptions/listen`
 * from, built on first use.
 *
 * It is a process singleton rather than something `createMcpHandler` builds
 * for itself because the publish side lives far from the transport: tool
 * handlers (`qase_discover_tools`) run several frames below the request
 * handler, and in the modern era each request is served by a fresh `Server`
 * instance that is gone by the time a listener needs telling. Handing
 * `createMcpHandler` this instance as its `bus` option is what joins the two
 * halves.
 *
 * It is LAZY because importing a module must not open sockets. With
 * `QASE_MCP_REDIS_URL` set, an eager singleton had every stdio process
 * connect two ioredis clients it can never use — `serveStdio` takes no bus —
 * and those handles can hold the process open past the stdin close the SDK's
 * stdio transport otherwise shuts down cleanly on.
 *
 * Without Redis this is the SDK's own in-process bus — correct for a single
 * replica, and the shape the SDK would have created anyway.
 */
export function getServerEventBus(): ServerEventBus {
  processBus ??= createServerEventBus() ?? new InMemoryServerEventBus();
  return processBus;
}

/**
 * Announce that the tool list changed, for clients listening on an open
 * `subscriptions/listen` stream.
 *
 * The event carries no subject: `ServerEventBus` has no addressing, so every
 * listening client is told to re-read its list. Activation is per-caller, so a
 * client whose own set did not change re-lists and sees the same tools — a
 * wasted round trip, never a wrong answer. A client that never opened a
 * subscription hears nothing at all; that is the era's design.
 *
 * Publishing deliberately does NOT build the bus. Only `createMcpHandler`
 * subscribes to it, and it gets its instance from `getServerEventBus()` — so
 * an unbuilt bus is by construction a bus with no listeners, and building one
 * here would connect to Redis purely to drop the event. This is the case on
 * stdio, where the live connection is notified directly instead (see
 * `announceToolListChanged` in src/operations-v2/meta/discover.ts).
 */
export function publishToolsListChanged(bus: ServerEventBus | undefined = processBus): void {
  bus?.publish({ kind: 'tools_list_changed' });
}
