/**
 * The destructive gate over streamable-http, end to end.
 *
 * WHAT CHANGED, AND WHY THIS FILE LOOKS SMALLER
 *
 * The gate used to ask through `elicitation/create` on the live session, and
 * this file's tests drove that conversation: prompt arrives, human answers,
 * the delete happens (or does not). Serving is per-request now. The SDK's own
 * words for the stateless legacy leg: "Per-request instances that never saw an
 * initialize (stateless legacy) hold nothing, so gates refuse there" — and
 * `server.getClientCapabilities()` is likewise empty, so
 * `confirmDestructiveAction` cannot establish that the client can be asked.
 * On the modern era there is no server→client request channel at all.
 *
 * So there is no prompt to drive on either path today, and the tests that
 * drove one are gone with the mechanism. What survives is the property those
 * tests existed to protect, and it is the one that must never regress: NOTHING
 * IS DELETED WITHOUT AN EXPLICIT YES. The gate is fail-closed, so losing the
 * channel costs a capability, never a silent deletion — that is asserted here
 * on both eras.
 *
 * Restoring a reachable prompt is the next change in this migration (the gate
 * moves to a multi-round-trip `input_required` result); it owns re-adding the
 * confirm/decline coverage on top of what is asserted here.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { setTestEnv } from '../utils/test-helpers.js';

setTestEnv();
process.env.QASE_OAUTH_ENABLED = 'false';

// The single Qase API call a successful qase_case_delete makes.
const deleteCase = jest.fn<(code: string, id: number) => Promise<unknown>>();

jest.mock('../client/index.js', () => ({
  getApiClient: () => ({ cases: { deleteCase } }),
  resetApiClient: () => {},
}));

let app: { _httpServer?: http.Server };
let baseUrl: URL;
const openClients: Client[] = [];

/**
 * Connect a client that declares the elicitation capability — the best case
 * for the gate, and the one that used to get a prompt.
 *
 * `modern: true` negotiates the 2026-07-28 era; without it the client runs the
 * plain 2025 sequence and is served by the handler's stateless legacy leg.
 */
async function connect(modern: boolean): Promise<Client> {
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    {
      capabilities: { elicitation: {} },
      ...(modern ? { versionNegotiation: { mode: 'auto' as const } } : {}),
    },
  );

  await client.connect(
    new StreamableHTTPClientTransport(baseUrl, {
      requestInit: { headers: { Authorization: 'Bearer test-token' } },
    }),
  );
  openClients.push(client);
  return client;
}

async function callDelete(client: Client) {
  return (await client.callTool({
    name: 'qase_case_delete',
    arguments: { code: 'TEST', id: 1 },
  })) as { isError?: boolean; content: Array<{ type: string; text: string }> };
}

beforeAll(async () => {
  const { createServer } = await import('../server.js');
  const { setupStreamableHttpTransport } = await import('./streamableHttp.js');
  app = setupStreamableHttpTransport(createServer, {
    port: 0,
    host: '127.0.0.1',
    endpoint: '/mcp',
  }) as unknown as { _httpServer?: http.Server };

  const httpServer = app._httpServer!;
  if (!httpServer.listening) {
    await new Promise<void>((resolve) => httpServer.once('listening', () => resolve()));
  }
  const address = httpServer.address() as AddressInfo;
  baseUrl = new URL(`http://127.0.0.1:${address.port}/mcp`);
  // Real listener on a real port: under a loaded parallel run this does not
  // fit in Jest's 5s default.
}, 30000);

beforeEach(() => {
  deleteCase.mockReset();
  deleteCase.mockResolvedValue({ data: { status: true, result: { id: 1 } } });
});

afterAll(async () => {
  await Promise.all(openClients.map((c) => c.close().catch(() => {})));
  const httpServer = app._httpServer;
  if (!httpServer) return;
  // Streamed responses can outlive the clients; drop the sockets so close()
  // does not wait on them.
  httpServer.closeAllConnections?.();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
}, 30000);

describe.each([
  // The two eras refuse for different reasons, and the difference is worth
  // pinning. On the legacy leg the per-request instance never saw an
  // initialize, so it cannot even establish that the client could be asked
  // ('unsupported'). On the modern era the client's capabilities DO arrive, on
  // the request's own `_meta` envelope — but the era has no server→client
  // request channel, so the send itself fails ('undeliverable'). Both land on
  // the same side of the gate.
  ['a 2025-era client on the stateless legacy leg', false, 'does not support MCP elicitation'],
  ['a 2026-07-28 client', true, 'was not answered'],
])('the destructive gate never opens without an answer: %s', (_label, modern, reason) => {
  it('refuses instead of deleting', async () => {
    const client = await connect(modern);

    const result = await callDelete(client);

    expect(deleteCase).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    // The refusal names what is missing, so the agent can act on it rather
    // than concluding the tool is broken.
    expect(result.content[0].text).toContain('Refused "qase_case_delete"');
    expect(result.content[0].text).toContain(reason);
  });

  it('answers immediately, without waiting on a prompt timeout', async () => {
    const client = await connect(modern);

    const started = Date.now();
    await callDelete(client);

    expect(Date.now() - started).toBeLessThan(1000);
  });
});
