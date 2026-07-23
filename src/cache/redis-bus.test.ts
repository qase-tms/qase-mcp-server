import { EventEmitter } from 'events';
import { RedisInvalidationBus } from './redis-bus.js';

interface FakePubSub {
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string): Promise<number>;
  on(event: 'message', handler: (channel: string, message: string) => void): this;
  quit(): Promise<'OK'>;
}

class FakeRedisPair extends EventEmitter {
  pubClient: FakePubSub;
  subClient: FakePubSub;

  constructor() {
    super();
    const self = this;
    this.pubClient = {
      async publish(channel, message) {
        self.emit('message', channel, message);
        return 1;
      },
      async subscribe() {
        return 1;
      },
      on() {
        throw new Error('pubClient does not subscribe');
      },
      async quit() {
        return 'OK';
      },
    };
    this.subClient = {
      async publish() {
        throw new Error('subClient does not publish');
      },
      async subscribe() {
        return 1;
      },
      on(_event: 'message', handler: (ch: string, msg: string) => void) {
        self.on('message', handler);
        return this;
      },
      async quit() {
        return 'OK';
      },
    };
  }
}

describe('RedisInvalidationBus', () => {
  const CHANNEL = 'qase-mcp:invalidations';

  it('publishes a pattern on the configured channel', async () => {
    const pair = new FakeRedisPair();
    const published: Array<[string, string]> = [];
    pair.pubClient.publish = async (ch, msg) => {
      published.push([ch, msg]);
      return 1;
    };

    const bus = new RedisInvalidationBus(pair.pubClient as any, pair.subClient as any, CHANNEL);
    await bus.publish('v1:h:tenantA:');

    expect(published).toEqual([[CHANNEL, expect.stringContaining('v1:h:tenantA:')]]);
    await bus.close();
  });

  it('delivers incoming messages to subscribers', async () => {
    const pair = new FakeRedisPair();
    const received: string[] = [];
    const bus = new RedisInvalidationBus(pair.pubClient as any, pair.subClient as any, CHANNEL);
    await bus.subscribe((pattern) => received.push(pattern));

    await bus.publish('v1:h:tenantA:');

    expect(received).toEqual(['v1:h:tenantA:']);
    await bus.close();
  });

  it('supports multiple subscribers', async () => {
    const pair = new FakeRedisPair();
    const bus = new RedisInvalidationBus(pair.pubClient as any, pair.subClient as any, CHANNEL);
    const a: string[] = [];
    const b: string[] = [];
    await bus.subscribe((p) => a.push(p));
    await bus.subscribe((p) => b.push(p));

    await bus.publish('foo:');

    expect(a).toEqual(['foo:']);
    expect(b).toEqual(['foo:']);
    await bus.close();
  });

  it('ignores malformed messages without throwing', async () => {
    const pair = new FakeRedisPair();
    const received: string[] = [];
    const bus = new RedisInvalidationBus(pair.pubClient as any, pair.subClient as any, CHANNEL);
    await bus.subscribe((p) => received.push(p));

    pair.emit('message', CHANNEL, 'not-json-at-all');
    pair.emit('message', CHANNEL, JSON.stringify({ wrong: 'shape' }));

    expect(received).toEqual([]);
    await bus.close();
  });

  it('close() quits both clients', async () => {
    const pair = new FakeRedisPair();
    const pubQuit = jest.spyOn(pair.pubClient, 'quit');
    const subQuit = jest.spyOn(pair.subClient, 'quit');
    const bus = new RedisInvalidationBus(pair.pubClient as any, pair.subClient as any, CHANNEL);
    await bus.close();
    expect(pubQuit).toHaveBeenCalled();
    expect(subQuit).toHaveBeenCalled();
  });
});
