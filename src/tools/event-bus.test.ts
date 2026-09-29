import { describe, it, expect } from '@jest/globals';
import { RedisServerEventBus, createServerEventBus, wireRemoteSubscription } from './event-bus.js';

describe('RedisServerEventBus', () => {
  it('delivers a locally published event to local subscribers', () => {
    const pub = { publish: async () => 1 };
    const bus = new RedisServerEventBus(pub as never);
    const seen: unknown[] = [];
    bus.subscribe((e) => seen.push(e));

    bus.publish({ type: 'tools/list_changed' } as never);

    expect(seen).toHaveLength(1);
  });

  it('delivers an event that arrived from another replica', () => {
    const pub = { publish: async () => 1 };
    const bus = new RedisServerEventBus(pub as never);
    const seen: unknown[] = [];
    bus.subscribe((e) => seen.push(e));

    bus.onRemoteMessage(JSON.stringify({ type: 'tools/list_changed' }));

    expect(seen).toHaveLength(1);
  });

  it('ignores a malformed remote message rather than throwing', () => {
    const pub = { publish: async () => 1 };
    const bus = new RedisServerEventBus(pub as never);
    bus.subscribe(() => {});

    expect(() => bus.onRemoteMessage('not json')).not.toThrow();
  });

  it('keeps delivering after one subscriber throws', () => {
    const pub = { publish: async () => 1 };
    const bus = new RedisServerEventBus(pub as never);
    const seen: unknown[] = [];
    bus.subscribe(() => { throw new Error('bad listener'); });
    bus.subscribe((e) => seen.push(e));

    bus.publish({ type: 'tools/list_changed' } as never);

    expect(seen).toHaveLength(1);
  });
});

function fakeSub() {
  let handler: ((channel: string, message: string) => void) | undefined;
  const sub = {
    on: (_event: 'message', h: (channel: string, message: string) => void) => {
      handler = h;
      return sub;
    },
    subscribe: async () => 1,
  };
  return { sub, deliver: (channel: string, message: string) => handler?.(channel, message) };
}

describe('wireRemoteSubscription', () => {
  it('delivers a message on the configured channel to the bus', () => {
    const { sub, deliver } = fakeSub();
    const pub = { publish: async () => 1 };
    const bus = new RedisServerEventBus(pub as never);
    const seen: unknown[] = [];
    bus.subscribe((e) => seen.push(e));

    wireRemoteSubscription(sub as never, bus, 'mcp:server-events');
    deliver('mcp:server-events', JSON.stringify({ type: 'tools/list_changed' }));

    expect(seen).toHaveLength(1);
  });

  it('ignores a message on an unrelated channel', () => {
    const { sub, deliver } = fakeSub();
    const pub = { publish: async () => 1 };
    const bus = new RedisServerEventBus(pub as never);
    const seen: unknown[] = [];
    bus.subscribe((e) => seen.push(e));

    wireRemoteSubscription(sub as never, bus, 'mcp:server-events');
    deliver('some-other-channel', JSON.stringify({ type: 'tools/list_changed' }));

    expect(seen).toHaveLength(0);
  });

  it('does not deliver a published event twice on the replica that published it', () => {
    // Reproduces what Redis actually does: PUBLISH on a channel this same
    // process is also SUBSCRIBEd to delivers the message back to us, on top
    // of the synchronous local delivery `publish()` already did. Without an
    // origin stamp, RedisServerEventBus fires every local listener twice for
    // one locally-published event.
    const { sub, deliver } = fakeSub();
    const pub = {
      publish: async (channel: string, message: string) => {
        // Simulate Redis: our own subscriber receives every message we publish.
        deliver(channel, message);
        return 1;
      },
    };
    const bus = new RedisServerEventBus(pub as never);
    const seen: unknown[] = [];
    bus.subscribe((e) => seen.push(e));
    wireRemoteSubscription(sub as never, bus, 'mcp:server-events');

    bus.publish({ type: 'tools/list_changed' } as never);

    expect(seen).toHaveLength(1);
  });
});

describe('createServerEventBus', () => {
  it('returns undefined when no Redis URL is configured', () => {
    expect(createServerEventBus({} as NodeJS.ProcessEnv)).toBeUndefined();
  });
});
