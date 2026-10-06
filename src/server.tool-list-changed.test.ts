/**
 * Activation must reach a client on a live connection (stdio, and anything
 * else that keeps one server instance for the whole session).
 *
 * This is the other half of issue #93, the bug 2.6.0 fixed: `qase_discover_tools`
 * reported tools as activated and the client's list stayed stale. The HTTP
 * modern era hears about it over `subscriptions/listen` — covered by
 * `src/transports/streamableHttp.tool-list-changed.test.ts` — but `serveStdio`
 * takes no event bus at all, so a bus publish reaches nobody there. stdio is
 * the distribution most users run (Claude Desktop, Cursor, the npm package),
 * which makes it the widest channel the regression could return on.
 *
 * On a live connection one `Server` instance serves the whole session, so the
 * notice goes out on it directly via `sendToolListChanged()`. This drives the
 * real `createServer()` handlers over `InMemoryTransport` — the same pairing
 * `spec-compliance.test.ts` and `server.subject-isolation.test.ts` use for an
 * in-process server — rather than spawning a child process, so the assertion
 * is about the notification and not about process plumbing.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { setTestEnv } from './utils/test-helpers.js';

setTestEnv();

// The operation modules build an API client on import; stub it away.
jest.mock('./client/index.js', () => {
  const mockResponse = Promise.resolve({ data: { status: true, result: {} } });
  const createDeepProxy = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
          const fn = jest.fn().mockReturnValue(mockResponse);
          return new Proxy(fn, {
            get(fnTarget, fnProp) {
              if (fnProp in fnTarget) return (fnTarget as any)[fnProp];
              return jest.fn().mockReturnValue(mockResponse);
            },
          });
        },
      },
    );

  return {
    getApiClient: jest.fn().mockReturnValue(createDeepProxy()),
    apiRequest: jest.fn().mockResolvedValue({ status: true, result: {} }),
    resetClientInstance: jest.fn(),
  };
});

import { createServer } from './server.js';

let client: Client;

/** Resolves on the next `notifications/tools/list_changed`, or rejects on timeout. */
function nextToolsListChanged(timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('no notifications/tools/list_changed within the timeout')),
      timeoutMs,
    );
    client.setNotificationHandler('notifications/tools/list_changed', async () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

beforeAll(async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'tool-list-changed-test', version: '1.0.0' });
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close().catch(() => {});
});

describe('tools/list_changed on a live connection', () => {
  it('reaches the connected client after an activation', async () => {
    const notified = nextToolsListChanged();

    const result = (await client.callTool({
      name: 'qase_discover_tools',
      arguments: { query: 'milestone' },
    })) as { structuredContent?: { activated?: number } };

    expect(result.structuredContent?.activated).toBeGreaterThan(0);
    await expect(notified).resolves.toBeUndefined();
  }, 20000);

  it('says nothing when discovery activates nothing new', async () => {
    // First call activates; let its notice land before the counter goes up.
    await client.callTool({ name: 'qase_discover_tools', arguments: { query: 'shared step' } });
    await new Promise((resolve) => setTimeout(resolve, 250));

    let notifications = 0;
    client.setNotificationHandler('notifications/tools/list_changed', async () => {
      notifications += 1;
    });

    const second = (await client.callTool({
      name: 'qase_discover_tools',
      arguments: { query: 'shared step' },
    })) as { structuredContent?: { activated?: number } };

    expect(second.structuredContent?.activated).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(notifications).toBe(0);
  }, 20000);
});
