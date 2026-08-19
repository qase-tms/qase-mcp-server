/**
 * Integration Marker Capture (streamable-http)
 *
 * Drives the real Express app so both supported channels are exercised end to
 * end: the `X-Qase-Integration` request header and the `?integration=` query
 * parameter on the MCP endpoint. Both exist on purpose — it is not yet proven
 * that custom headers survive the OAuth flow on the hosted endpoint in every MCP
 * client, and the query parameter is the fallback.
 *
 * The tool handler reports getIntegration(), i.e. what a Qase API call made from
 * inside that request would actually see.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import type http from 'node:http';
import request from 'supertest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getIntegration } from '../utils/integration-context.js';

process.env.QASE_OAUTH_ENABLED = 'false';

let app: ReturnType<typeof import('./streamableHttp.js').setupStreamableHttpTransport>;

function makeServer(): Server {
  const server = new Server({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{ name: 'whoami', description: 'reports the integration marker', inputSchema: { type: 'object' } }],
  }));
  server.setRequestHandler(CallToolRequestSchema, async () => ({
    content: [{ type: 'text', text: getIntegration() ?? 'none' }],
  }));
  return server;
}

const ACCEPT = 'application/json, text/event-stream';

/** Initialize a session, optionally with a header and/or a query marker. */
async function initSession(opts: { header?: string; query?: string } = {}): Promise<string> {
  let req = request(app).post('/mcp');
  if (opts.query !== undefined) req = req.query({ integration: opts.query });
  if (opts.header !== undefined) req = req.set('X-Qase-Integration', opts.header);

  const res = await req.set('Accept', ACCEPT).send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  });

  expect(res.status).toBe(200);
  const sessionId = res.headers['mcp-session-id'];
  expect(typeof sessionId).toBe('string');
  return sessionId;
}

/** Call the whoami tool on a session and return the marker it observed. */
async function whoami(sessionId: string, header?: string): Promise<string> {
  let req = request(app).post('/mcp').set('mcp-session-id', sessionId);
  if (header !== undefined) req = req.set('X-Qase-Integration', header);

  const res = await req
    .set('Accept', ACCEPT)
    .send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'whoami', arguments: {} } });

  expect(res.status).toBe(200);
  return res.body.result.content[0].text;
}

beforeAll(async () => {
  const { setupStreamableHttpTransport } = await import('./streamableHttp.js');
  // port 0 → ephemeral; the app is driven through supertest.
  app = setupStreamableHttpTransport(makeServer, { port: 0, host: '127.0.0.1', endpoint: '/mcp' });
});

afterEach(() => {
  delete process.env.QASE_MCP_INTEGRATION;
});

afterAll(async () => {
  // setupStreamableHttpTransport starts a listener; release it so the run ends.
  const httpServer = (app as unknown as { _httpServer?: http.Server })._httpServer;
  if (httpServer) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe('streamable-http integration marker', () => {
  it('captures the marker from the ?integration= query parameter at session creation', async () => {
    const sessionId = await initSession({ query: 'quality-supervisor/1.0.0' });
    // Later requests carry no marker of their own — the session remembers it.
    expect(await whoami(sessionId)).toBe('quality-supervisor/1.0.0');
  });

  it('captures the marker from the X-Qase-Integration request header', async () => {
    const sessionId = await initSession({ header: 'quality-supervisor/2.0.0' });
    expect(await whoami(sessionId)).toBe('quality-supervisor/2.0.0');
  });

  it('accepts the header on any request, not just initialize', async () => {
    const sessionId = await initSession();
    expect(await whoami(sessionId, 'quality-supervisor/3.0.0')).toBe('quality-supervisor/3.0.0');
  });

  it('prefers the request header over the value remembered for the session', async () => {
    const sessionId = await initSession({ query: 'quality-supervisor/1.0.0' });
    expect(await whoami(sessionId, 'quality-supervisor/9.9.9')).toBe('quality-supervisor/9.9.9');
    // …and the session value survives for requests that send no header.
    expect(await whoami(sessionId)).toBe('quality-supervisor/1.0.0');
  });

  it('prefers the header over the query parameter when both are present', async () => {
    const sessionId = await initSession({
      header: 'quality-supervisor/2.0.0',
      query: 'quality-supervisor/1.0.0',
    });
    expect(await whoami(sessionId)).toBe('quality-supervisor/2.0.0');
  });

  it('keeps two concurrent sessions with different markers apart', async () => {
    const [first, second] = await Promise.all([
      initSession({ query: 'quality-supervisor/1.0.0' }),
      initSession({ header: 'quality-supervisor/2.0.0' }),
    ]);

    const [firstMarker, secondMarker] = await Promise.all([whoami(first), whoami(second)]);

    expect(firstMarker).toBe('quality-supervisor/1.0.0');
    expect(secondMarker).toBe('quality-supervisor/2.0.0');
  });

  it('does not remember a non-allowlisted or malformed marker', async () => {
    const sessionId = await initSession({ query: 'some-random-plugin/1.0.0' });
    expect(await whoami(sessionId, 'not a marker at all')).toBe('none');
  });

  it('normalises what it remembers to the canonical form', async () => {
    const sessionId = await initSession({ query: ' Quality-Supervisor / 1.0.0 ' });
    expect(await whoami(sessionId)).toBe('quality-supervisor/1.0.0');
  });

  it('lets a session without a marker fall through to QASE_MCP_INTEGRATION', async () => {
    process.env.QASE_MCP_INTEGRATION = 'quality-supervisor/4.0.0';
    const sessionId = await initSession();
    expect(await whoami(sessionId)).toBe('quality-supervisor/4.0.0');
  });
});
