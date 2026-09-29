import { describe, it, expect } from '@jest/globals';
import { RedisServerEventBus } from './event-bus.js';

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
