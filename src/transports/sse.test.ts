/**
 * Legacy HTTP+SSE transport (end to end)
 *
 * The deprecated transport still ships behind `--transport sse`, and nothing
 * covered it. Two things are checked here, with the real MCP SDK client over
 * real HTTP: that a client's POST is understood at all, and that the
 * destructive-action gate behaves the same as on the other transports.
 *
 * The bug this guards: `express.json()` consumes the request body, so
 * `handlePostMessage()` has to be handed the parsed body — without it the SDK
 * tries to read a spent stream and every call fails with
 * "stream is not readable", long before any tool runs.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { setTestEnv } from '../utils/test-helpers.js';

setTestEnv();
process.env.QASE_OAUTH_ENABLED = 'false';

const deleteCase = jest.fn<(code: string, id: number) => Promise<unknown>>();

jest.mock('../client/index.js', () => ({
  getApiClient: () => ({ cases: { deleteCase } }),
  resetApiClient: () => {},
}));

let app: { _httpServer?: http.Server };
let client: Client;

// This transport serves one connection at a time, so every test shares a single
// client and swaps the answer the elicitation handler gives.
let answer: { action: 'accept' | 'decline' } = { action: 'decline' };
let prompts = 0;

beforeAll(async () => {
  const { createServer } = await import('../server.js');
  const { setupSSETransport } = await import('./sse.js');
  app = setupSSETransport(createServer(), {
    port: 0,
    host: '127.0.0.1',
  }) as unknown as { _httpServer?: http.Server };

  const httpServer = app._httpServer!;
  if (!httpServer.listening) {
    await new Promise<void>((resolve) => httpServer.once('listening', () => resolve()));
  }
  const sseUrl = new URL(`http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/sse`);

  client = new Client(
    { name: 'sse-test-client', version: '1.0.0' },
    { capabilities: { elicitation: {} } },
  );
  client.setRequestHandler(ElicitRequestSchema, async () => {
    prompts += 1;
    return answer.action === 'accept' ? { action: 'accept', content: {} } : { action: 'decline' };
  });
  await client.connect(new SSEClientTransport(sseUrl));
  // Real listener plus a real SSE handshake: under a loaded parallel run this
  // does not fit in Jest's 5s default.
}, 30000);

beforeEach(() => {
  deleteCase.mockReset();
  deleteCase.mockResolvedValue({ data: { status: true, result: { id: 1 } } });
  prompts = 0;
});

afterAll(async () => {
  await client.close().catch(() => {});
  const httpServer = app._httpServer;
  if (!httpServer) return;
  // The SSE stream is a response that never ends on its own, so close() would
  // wait for it forever — drop the sockets first.
  httpServer.closeAllConnections?.();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
}, 30000);

describe('legacy SSE transport', () => {
  it('understands a client POST at all', async () => {
    const result = (await client.callTool({
      name: 'qase_discover_tools',
      arguments: { query: 'delete' },
    })) as { content: Array<{ text: string }> };

    expect(JSON.parse(result.content[0].text).found).toBeGreaterThan(0);
  });

  it('delivers the confirmation prompt and deletes once it is accepted', async () => {
    answer = { action: 'accept' };

    await client.callTool({ name: 'qase_case_delete', arguments: { code: 'TEST', id: 1 } });

    expect(prompts).toBe(1);
    expect(deleteCase).toHaveBeenCalledWith('TEST', 1);
  });

  it('does not delete when the user declines', async () => {
    answer = { action: 'decline' };

    const result = (await client.callTool({
      name: 'qase_case_delete',
      arguments: { code: 'TEST', id: 1 },
    })) as { content: Array<{ text: string }> };

    expect(deleteCase).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('declined');
  });
});
