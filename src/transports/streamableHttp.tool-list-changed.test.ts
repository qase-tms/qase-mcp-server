/**
 * Activation must reach a listening client (end to end).
 *
 * This replaces `src/server.tool-list-changed.test.ts`, deleted along with the
 * registry's process-wide listener set. That test guarded the fix released in
 * 2.6.0 (issue #93): `qase_discover_tools` reported tools as activated, but the
 * notice never reached the connected session, so the client's tool list stayed
 * stale and the agent concluded the capability did not exist. The bug shipped
 * to production once; the mechanism it lived in is gone, the failure mode is
 * not.
 *
 * The mechanism now: the client opens a `subscriptions/listen` stream (the
 * 2026-07-28 replacement for the standalone GET stream), and activation
 * publishes onto the `ServerEventBus` the handler serves those streams from.
 * The whole chain is exercised — real Express app, real SDK client, real tool
 * handler — because every link in it is somewhere the notice was dropped
 * before.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { setupStreamableHttpTransport } from './streamableHttp.js';
import { createServer } from '../server.js';
import { setTestEnv } from '../utils/test-helpers.js';

setTestEnv();
const previousOAuth = process.env.QASE_OAUTH_ENABLED;
let app: ReturnType<typeof setupStreamableHttpTransport>;
let baseUrl: URL;
const openClients: Client[] = [];

async function connectModern(): Promise<Client> {
  const client = new Client(
    { name: 'listener', version: '1' },
    { versionNegotiation: { mode: 'auto' } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(baseUrl, {
      requestInit: { headers: { Authorization: 'Bearer test-token' } },
    }),
  );
  openClients.push(client);
  return client;
}

/** Resolves on the next `notifications/tools/list_changed`, or rejects on timeout. */
function nextToolsListChanged(client: Client, timeoutMs = 5000): Promise<void> {
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
  process.env.QASE_OAUTH_ENABLED = 'false';
  app = setupStreamableHttpTransport(createServer, {
    port: 0,
    host: '127.0.0.1',
    endpoint: '/mcp',
  });

  const httpServer = (app as unknown as { _httpServer: http.Server })._httpServer;
  if (!httpServer.listening) {
    await new Promise<void>((resolve) => httpServer.once('listening', () => resolve()));
  }
  baseUrl = new URL(`http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`);
}, 30000);

afterAll(async () => {
  await Promise.all(openClients.map((c) => c.close().catch(() => {})));
  const httpServer = (app as unknown as { _httpServer?: http.Server })._httpServer;
  if (httpServer) {
    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
  if (previousOAuth === undefined) delete process.env.QASE_OAUTH_ENABLED;
  else process.env.QASE_OAUTH_ENABLED = previousOAuth;
}, 30000);

describe('tools/list_changed on an open subscription', () => {
  it('reaches a client that opened subscriptions/listen after an activation', async () => {
    const client = await connectModern();
    const subscription = await client.listen({ toolsListChanged: true });
    expect(subscription.honoredFilter.toolsListChanged).toBe(true);

    const notified = nextToolsListChanged(client);

    // A tool that is hidden by default, so this really activates something.
    const result = (await client.callTool({
      name: 'qase_discover_tools',
      arguments: { query: 'milestone' },
    })) as { structuredContent?: { activated?: number } };

    expect(result.structuredContent?.activated).toBeGreaterThan(0);
    await expect(notified).resolves.toBeUndefined();

    await subscription.close();
  }, 30000);

  it('says nothing when discovery activates nothing new', async () => {
    const client = await connectModern();
    const subscription = await client.listen({ toolsListChanged: true });

    // First call activates; the second finds everything already on. Let the
    // first call's notification land before the counter goes up, or it would
    // be counted against the second.
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
    // Give a stray notification time to arrive before declaring none did.
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(notifications).toBe(0);

    await subscription.close();
  }, 30000);
});
