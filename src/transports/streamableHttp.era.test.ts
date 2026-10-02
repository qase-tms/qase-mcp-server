/**
 * Protocol era negotiation on the streamable-http endpoint.
 *
 * The endpoint is served by `createMcpHandler`, which is per-request by
 * construction: a client that negotiates 2026-07-28 is served the modern era,
 * a 2025-era client is still served through the handler's stateless legacy
 * path, and the two session operations of the 2025 era (`GET` and `DELETE` on
 * /mcp) no longer exist — there is no session to stream on or to delete.
 *
 * Note on how the era is asked for. The plan's draft of this test posted an
 * `initialize` naming protocolVersion 2026-07-28 and expected that version
 * back. That can never happen: the SDK classifies `initialize` as the legacy
 * handshake BY DEFINITION, whatever version its body names (see
 * `InboundLegacyRouteReason`, `'initialize'`). A modern client does not send
 * `initialize` at all — it probes with `server/discover` and then carries a
 * per-request `_meta` envelope. So the era is asked for the way a real client
 * asks for it: through the SDK client's `versionNegotiation` option.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { setupStreamableHttpTransport } from './streamableHttp.js';
import { createServer } from '../server.js';
import { setTestEnv } from '../utils/test-helpers.js';

setTestEnv();
const previousOAuth = process.env.QASE_OAUTH_ENABLED;
let app: ReturnType<typeof setupStreamableHttpTransport>;
let baseUrl: URL;
const openClients: Client[] = [];

/**
 * Connect a client. `modern: true` opts into version negotiation (the probe
 * that selects 2026-07-28); without it the client runs the plain 2025
 * sequence, byte-identical to a client that has not moved yet.
 */
async function connect(modern: boolean): Promise<Client> {
  const client = new Client(
    { name: 't', version: '1' },
    modern ? { versionNegotiation: { mode: 'auto' } } : {},
  );
  await client.connect(
    new StreamableHTTPClientTransport(baseUrl, {
      requestInit: { headers: { Authorization: 'Bearer test-token' } },
    }),
  );
  openClients.push(client);
  return client;
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

describe('protocol era', () => {
  it('negotiates 2026-07-28 when the client asks for it', async () => {
    const client = await connect(true);

    expect(client.getProtocolEra()).toBe('modern');
    expect(client.getNegotiatedProtocolVersion()).toBe('2026-07-28');

    // …and it is actually served, not just negotiated.
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('still serves a 2025-era client', async () => {
    const client = await connect(false);

    expect(client.getProtocolEra()).toBe('legacy');
    expect(client.getNegotiatedProtocolVersion()).toBe('2025-11-25');

    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('answers 405 on the session operations that no longer exist', async () => {
    const get = await request(app).get('/mcp').set('Authorization', 'Bearer test-token');
    const del = await request(app).delete('/mcp').set('Authorization', 'Bearer test-token');

    expect(get.status).toBe(405);
    expect(del.status).toBe(405);
  });

  it('hands out no mcp-session-id to a 2025-era client either', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', 'Bearer test-token')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 't', version: '1' },
        },
      });

    expect(res.status).toBe(200);
    expect(res.headers['mcp-session-id']).toBeUndefined();
  });
});
