/**
 * Destructive-Action Confirmation over streamable-http (end to end)
 *
 * Drives the real Express app with the real MCP SDK client, so the whole chain
 * is exercised: tools/call → destructive gate → elicitation prompt on the
 * stream of that very call → the client's answer → the Qase API call, or not.
 *
 * The bug this guards: the prompt used to be routed to the standalone SSE
 * stream (`GET /mcp`), which no client opens, so it was dropped — and the
 * server deleted the entity anyway, unconfirmed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
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
 * Connect a client. `onElicit` present → the client declares the elicitation
 * capability and answers prompts with it; absent → no capability at all, like
 * the clients that were deleting entities without ever being asked.
 */
async function connect(
  onElicit?: (
    message: string,
    schemaProperties: Record<string, unknown>,
  ) => { action: 'accept' | 'decline' | 'cancel'; confirm?: boolean },
): Promise<Client> {
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: onElicit ? { elicitation: {} } : {} },
  );

  if (onElicit) {
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      const answer = onElicit(
        request.params.message,
        ((request.params as { requestedSchema?: { properties?: Record<string, unknown> } })
          .requestedSchema?.properties ?? {}),
      );
      return answer.action === 'accept' ? { action: 'accept', content: {} } : { action: answer.action };
    });
  }

  await client.connect(new StreamableHTTPClientTransport(baseUrl));
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

describe('destructive confirmation over streamable-http', () => {
  it('deletes once the user confirms the prompt', async () => {
    const prompts: string[] = [];
    const client = await connect((message) => {
      prompts.push(message);
      return { action: 'accept', confirm: true };
    });

    const result = await callDelete(client);

    // The prompt reached the client on the stream of this very call.
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('qase_case_delete');
    expect(deleteCase).toHaveBeenCalledWith('TEST', 1);
    expect(result.isError).toBeFalsy();
  });

  it('does not delete when the user declines', async () => {
    const client = await connect(() => ({ action: 'decline' }));

    const result = await callDelete(client);

    expect(deleteCase).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('declined');
    // A human saying no is a decision, not a tool failure.
    expect(result.isError).toBeFalsy();
  });

  it('deletes on a bare accept — the prompt carries no fields to fill in', async () => {
    const prompts: Array<Record<string, unknown>> = [];
    const client = await connect((message, schema) => {
      prompts.push(schema);
      expect(message).toContain('qase_case_delete');
      return { action: 'accept' };
    });

    await callDelete(client);

    expect(prompts[0]).toEqual({});
    expect(deleteCase).toHaveBeenCalledWith('TEST', 1);
  });

  it('refuses instead of deleting when the client cannot be asked', async () => {
    const client = await connect();

    const result = await callDelete(client);

    expect(deleteCase).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('elicitation');
  });

  it('answers a client that cannot be asked immediately, without waiting on a timeout', async () => {
    const client = await connect();

    const started = Date.now();
    await callDelete(client);

    expect(Date.now() - started).toBeLessThan(1000);
  });
});

/**
 * The SDK client above opens the standalone `GET /mcp` stream, so a prompt
 * could reach it either way. Real clients (Claude, Cursor, Codex) do not open
 * it — for them the prompt has to travel on the POST response of the call
 * itself. This block speaks raw HTTP and never opens that stream, which is the
 * exact shape that used to hang for 60s and then delete unconfirmed.
 */
describe('destructive confirmation without a standalone SSE stream', () => {
  const ACCEPT = 'application/json, text/event-stream';

  async function post(body: unknown, sessionId?: string): Promise<Response> {
    return fetch(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: ACCEPT,
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  /** Read SSE `data:` payloads off a response body until `done` returns true. */
  async function readMessages(
    response: Response,
    onMessage: (msg: any) => boolean | Promise<boolean>,
  ): Promise<void> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });

      let split: number;
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice('data:'.length).trim())
          .join('');
        if (!data) continue;
        if (await onMessage(JSON.parse(data))) {
          await reader.cancel();
          return;
        }
      }
    }
  }

  async function initSession(): Promise<string> {
    const res = await post({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: { elicitation: {} },
        clientInfo: { name: 'raw-client', version: '1.0.0' },
      },
    });
    const sessionId = res.headers.get('mcp-session-id')!;
    expect(typeof sessionId).toBe('string');
    await res.body?.cancel();

    await post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);
    return sessionId;
  }

  it('delivers the prompt on the response of the call and deletes only after the answer', async () => {
    const sessionId = await initSession();

    const res = await post(
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'qase_case_delete', arguments: { code: 'TEST', id: 1 } },
      },
      sessionId,
    );

    let prompted = false;
    let toolResult: any;

    await readMessages(res, async (msg) => {
      if (msg.method === 'elicitation/create') {
        prompted = true;
        expect(msg.params.message).toContain('qase_case_delete');
        // The entity must still be untouched while we are being asked.
        expect(deleteCase).not.toHaveBeenCalled();
        await post(
          { jsonrpc: '2.0', id: msg.id, result: { action: 'accept', content: {} } },
          sessionId,
        );
        return false;
      }
      if (msg.id === 2) {
        toolResult = msg.result;
        return true;
      }
      return false;
    });

    expect(prompted).toBe(true);
    expect(deleteCase).toHaveBeenCalledWith('TEST', 1);
    expect(toolResult.isError).toBeFalsy();
  }, 15000);
});
