import { InvalidationBus } from './types.js';

export interface RedisLikePub {
  publish(channel: string, message: string): Promise<number>;
  quit(): Promise<'OK'>;
}

export interface RedisLikeSub {
  subscribe(channel: string): Promise<number>;
  on(event: 'message', handler: (channel: string, message: string) => void): this;
  quit(): Promise<'OK'>;
}

interface InvalidationEnvelope {
  pattern: string;
}

/**
 * InvalidationBus over Redis Pub/Sub.
 *
 * Message format: `{"pattern":"..."}` (JSON). Malformed messages are dropped
 * silently — we never throw on receive so a single bad publisher cannot
 * poison the bus for every subscriber.
 */
export class RedisInvalidationBus implements InvalidationBus {
  private handlers: Array<(pattern: string) => void> = [];
  private subscribed = false;

  constructor(
    private readonly pub: RedisLikePub,
    private readonly sub: RedisLikeSub,
    private readonly channel: string,
  ) {}

  async publish(prefix: string): Promise<void> {
    const env: InvalidationEnvelope = { pattern: prefix };
    await this.pub.publish(this.channel, JSON.stringify(env));
  }

  async subscribe(handler: (pattern: string) => void): Promise<void> {
    this.handlers.push(handler);
    if (this.subscribed) return;
    this.subscribed = true;

    this.sub.on('message', (channel, message) => {
      if (channel !== this.channel) return;
      let env: InvalidationEnvelope;
      try {
        env = JSON.parse(message);
      } catch {
        return;
      }
      if (typeof env?.pattern !== 'string') return;
      for (const h of this.handlers) h(env.pattern);
    });

    await this.sub.subscribe(this.channel);
  }

  async close(): Promise<void> {
    this.handlers = [];
    await Promise.allSettled([this.pub.quit(), this.sub.quit()]);
  }
}
