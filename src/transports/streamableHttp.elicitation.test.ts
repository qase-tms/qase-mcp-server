/**
 * The destructive gate over streamable-http, end to end.
 *
 * WHAT CHANGED. The gate used to ask through `elicitation/create` on the live
 * session and wait inside the call for the answer. Serving is per-request now,
 * so there is no session to wait on: the handler RETURNS an input-required
 * result and reads the answer off the client's retry (multi-round-trip). The
 * property under test is unchanged and is the one that must never regress:
 * NOTHING IS DELETED WITHOUT AN EXPLICIT YES.
 *
 * These tests drive a real SDK client against a real listening app, because
 * the round trip is the mechanism — the client fulfils the embedded
 * elicitation through its own registered handler and retries the call with the
 * answer and the echoed `requestState`, all inside one `callTool()`.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { ElicitResult } from '@modelcontextprotocol/client';
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
 * Connect a client.
 *
 * `modern: true` negotiates the 2026-07-28 era, on which the server can ask
 * for confirmation; without it the client runs the plain 2025 sequence and is
 * served by the handler's stateless legacy leg, which cannot be asked at all.
 *
 * `answer` is what the human says when the prompt arrives: registered as the
 * client's own `elicitation/create` handler, which is what the multi-round-trip
 * driver dispatches the embedded request to before retrying the call.
 */
async function connect(
  modern: boolean,
  answer?: 'accept' | 'decline' | 'cancel',
  options: { autoFulfill?: boolean } = {},
): Promise<Client> {
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    {
      capabilities: { elicitation: {} },
      ...(modern ? { versionNegotiation: { mode: 'auto' as const } } : {}),
      ...(options.autoFulfill === false ? { inputRequired: { autoFulfill: false } } : {}),
    },
  );

  if (answer !== undefined) {
    client.setRequestHandler(
      'elicitation/create',
      (): ElicitResult => ({ action: answer, ...(answer === 'accept' && { content: {} }) }),
    );
  }

  await client.connect(
    new StreamableHTTPClientTransport(baseUrl, {
      requestInit: { headers: { Authorization: 'Bearer test-token' } },
    }),
  );
  openClients.push(client);
  return client;
}

type DeleteResult = {
  isError?: boolean;
  content?: Array<{ type: string; text: string }>;
  resultType?: string;
  inputRequests?: Record<string, { method: string; params: { message: string } }>;
  requestState?: string;
};

async function callDelete(client: Client, options = {}): Promise<DeleteResult> {
  return (await client.callTool(
    { name: 'qase_case_delete', arguments: { code: 'TEST', id: 1 } },
    options,
  )) as DeleteResult;
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

describe('the destructive gate on the 2026-07-28 era', () => {
  // (a) The first round asks. It does not delete, and it does not refuse
  // either — the answer is still outstanding. Manual mode (`autoFulfill:
  // false` + `allowInputRequired`) hands the raw result back instead of
  // driving the round trip, which is the only way to see the first round on
  // its own.
  it('answers the first round with a request for confirmation, having deleted nothing', async () => {
    const client = await connect(true, undefined, { autoFulfill: false });

    const result = await callDelete(client, { allowInputRequired: true });

    expect(deleteCase).not.toHaveBeenCalled();
    expect(result.resultType).toBe('input_required');
    expect(result.inputRequests?.confirm?.method).toBe('elicitation/create');
    expect(result.inputRequests?.confirm?.params.message).toContain('qase_case_delete');
    // The state that carries the confirmation across the round trip. It is
    // signed and bound to this caller; without it the retry has nothing to
    // match the answer against.
    expect(typeof result.requestState).toBe('string');
  });

  // (b) The confirmation reaches the user and comes back: the delete happens.
  it('performs the deletion once the user accepts', async () => {
    const client = await connect(true, 'accept');

    const result = await callDelete(client);

    expect(deleteCase).toHaveBeenCalledWith('TEST', 1);
    expect(result.isError).toBeFalsy();
  });

  // (c) The user says no: nothing is deleted, and the refusal says so in
  // words the agent can relay.
  it('deletes nothing when the user declines, and says why', async () => {
    const client = await connect(true, 'decline');

    const result = await callDelete(client);

    expect(deleteCase).not.toHaveBeenCalled();
    expect(result.content?.[0].text).toContain('declined');
    expect(result.content?.[0].text).toContain('Nothing was deleted');
  });

  it('deletes nothing when the user cancels the prompt', async () => {
    const client = await connect(true, 'cancel');

    const result = await callDelete(client);

    expect(deleteCase).not.toHaveBeenCalled();
    expect(result.content?.[0].text).toContain('declined');
  });
});

// (d) A client on the older revision cannot be asked on a stateless leg, so
// the gate refuses at once rather than deleting unconfirmed — and rather than
// hanging on a prompt nobody will answer.
describe('the destructive gate for a 2025-era client', () => {
  it('refuses instead of deleting, naming the protocol revision as the reason', async () => {
    const client = await connect(false, 'accept');

    const result = await callDelete(client);

    expect(deleteCase).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.content?.[0].text).toContain('Refused "qase_case_delete"');
    expect(result.content?.[0].text).toContain('2025-11-25');
  });

  it('answers immediately, without waiting on a prompt timeout', async () => {
    const client = await connect(false, 'accept');

    const started = Date.now();
    await callDelete(client);

    expect(Date.now() - started).toBeLessThan(1000);
  });
});
