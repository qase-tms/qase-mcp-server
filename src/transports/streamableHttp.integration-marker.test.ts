/**
 * Integration Marker (streamable-http)
 *
 * The marker used to be captured once, on the `initialize` that opened a
 * session, and remembered for the life of that session. There are no sessions
 * any more, so that capture is gone; the marker is now read per request, off
 * the header (or the query parameter, for clients that cannot set headers) of
 * the request that carries it, and never carried over to the next one.
 *
 * Everything that asserted session-remembered behaviour is therefore gone from
 * this file: not a weakened expectation, an expectation about a mechanism that
 * no longer exists. What remains is the part of the chain that is genuinely
 * unchanged — the process-wide `QASE_MCP_INTEGRATION` fallback a stdio
 * deployment relies on, which a tool handler must still observe — plus the
 * per-request read that replaces the session capture.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from '@jest/globals';
import type http from 'node:http';
import request from 'supertest';
import { Server } from '@modelcontextprotocol/server';
import { getIntegration } from '../utils/integration-context.js';

process.env.QASE_OAUTH_ENABLED = 'false';

let app: ReturnType<typeof import('./streamableHttp.js').setupStreamableHttpTransport>;

function makeServer(): Server {
  const server = new Server({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler('tools/list', async () => ({
    tools: [
      {
        name: 'whoami',
        description: 'reports the integration marker',
        inputSchema: { type: 'object' },
      },
    ],
  }));
  server.setRequestHandler('tools/call', async () => ({
    content: [{ type: 'text', text: getIntegration() ?? 'none' }],
  }));
  return server;
}

const ACCEPT = 'application/json, text/event-stream';

/**
 * Responses on the legacy leg are SSE, so the JSON-RPC payload arrives in
 * `data:` lines.
 */
function parseSse(body: string): any {
  const data = body
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .join('');
  return JSON.parse(data);
}

/**
 * Call the whoami tool and return the marker it observed. Sessions are gone,
 * so this is one self-contained request; the handler answers it whether or not
 * an initialize ever preceded it.
 */
async function whoami(opts: { header?: string; query?: string } = {}): Promise<string> {
  let req = request(app).post('/mcp');
  if (opts.query !== undefined) req = req.query({ integration: opts.query });
  if (opts.header !== undefined) req = req.set('X-Qase-Integration', opts.header);

  const res = await req
    .set('Content-Type', 'application/json')
    .set('Accept', ACCEPT)
    .set('Authorization', 'Bearer test-token')
    .send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'whoami', arguments: {} },
    });

  expect(res.status).toBe(200);
  return parseSse(res.text).result.content[0].text;
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
  it('falls through to QASE_MCP_INTEGRATION when the request carries nothing', async () => {
    process.env.QASE_MCP_INTEGRATION = 'quality-supervisor/4.0.0';
    expect(await whoami()).toBe('quality-supervisor/4.0.0');
  });

  it('reports none when neither the request nor the environment names one', async () => {
    expect(await whoami()).toBe('none');
  });

  it('reads the marker from the header of the request that carries it', async () => {
    expect(await whoami({ header: 'quality-supervisor/2.0.0' })).toBe('quality-supervisor/2.0.0');
  });

  it('falls back to the query parameter, for clients that cannot set headers', async () => {
    expect(await whoami({ query: 'quality-supervisor/1.0.0' })).toBe('quality-supervisor/1.0.0');
  });

  it('does not carry a marker over from an earlier request', async () => {
    expect(await whoami({ header: 'quality-supervisor/2.0.0' })).toBe('quality-supervisor/2.0.0');
    expect(await whoami()).toBe('none');
  });
});
