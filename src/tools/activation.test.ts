import { describe, it, expect } from '@jest/globals';
import { createActivationStore, MemoryActivationStore, RedisActivationStore } from './activation.js';

describe('MemoryActivationStore', () => {
  it('starts empty for an unknown subject', async () => {
    const store = new MemoryActivationStore();
    expect(await store.get('user-1')).toEqual(new Set());
  });

  it('remembers what was added, per subject', async () => {
    const store = new MemoryActivationStore();
    await store.add('user-1', ['qase_case_delete']);

    expect(await store.get('user-1')).toEqual(new Set(['qase_case_delete']));
    expect(await store.get('user-2')).toEqual(new Set());
  });

  it('returns only the names that were not already active', async () => {
    const store = new MemoryActivationStore();
    expect(await store.add('user-1', ['a', 'b'])).toEqual(['a', 'b']);
    expect(await store.add('user-1', ['b', 'c'])).toEqual(['c']);
  });

  it('forgets a subject after the ttl', async () => {
    const store = new MemoryActivationStore(1);
    await store.add('user-1', ['a']);
    // Time is injected rather than slept on: a test that waits a second is a
    // test people start skipping.
    store.nowMs = () => Date.now() + 2000;
    expect(await store.get('user-1')).toEqual(new Set());
  });
});

describe('createActivationStore', () => {
  it('uses the in-process store when no Redis URL is configured', () => {
    const store = createActivationStore({} as NodeJS.ProcessEnv);
    expect(store).toBeInstanceOf(MemoryActivationStore);
  });
});

describe('RedisActivationStore', () => {
  const failing = {
    smembers: async () => {
      throw new Error('redis down');
    },
    sadd: async () => {
      throw new Error('redis down');
    },
    expire: async () => {
      throw new Error('redis down');
    },
  };

  it('answers empty instead of throwing when Redis is unreachable', async () => {
    const store = new RedisActivationStore(failing as never);
    expect(await store.get('user-1')).toEqual(new Set());
  });

  it('reports the names as newly added when the write fails', async () => {
    const store = new RedisActivationStore(failing as never);
    expect(await store.add('user-1', ['a'])).toEqual(['a']);
  });

  it('stores per subject and applies a ttl', async () => {
    const calls: string[][] = [];
    const fake = {
      smembers: async (k: string) => {
        calls.push(['smembers', k]);
        return [];
      },
      sadd: async (k: string, ...n: string[]) => {
        calls.push(['sadd', k, ...n]);
        return n.length;
      },
      expire: async (k: string, ttl: number) => {
        calls.push(['expire', k, String(ttl)]);
        return 1;
      },
    };
    const store = new RedisActivationStore(fake as never);
    await store.add('user-7', ['qase_case_delete']);

    expect(calls).toContainEqual(['sadd', 'mcp:tools:active:user-7', 'qase_case_delete']);
    expect(calls).toContainEqual(['expire', 'mcp:tools:active:user-7', '3600']);
  });
});
