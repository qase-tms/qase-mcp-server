/**
 * The 10 MB request-body limit, asserted on the real endpoint.
 *
 * `body-limit.test.ts` next door proves the two readers of the setting agree
 * with each other. That is not the same as proving the endpoint honours it:
 * both the MCP handler and the Node adapter carry their own 4 MiB default, and
 * either of them taking effect would silently undo the limit that release 2.7.5
 * shipped for `qase_attachment_upload` — which sends file content as base64
 * inside the JSON-RPC body, because on a network transport the server cannot
 * see the caller's filesystem.
 *
 * So this posts a body in the gap between the two numbers: comfortably over
 * 4 MiB, comfortably under 10 MB. A 413 here means something along the chain
 * is capping at its own default. The JSON-RPC answer itself is not the point —
 * only that the body was accepted rather than rejected unread.
 *
 * What it takes to make this test fail, measured rather than assumed:
 *
 * | `parsedBody` passed | `maxRequestBodySize` set | 6 MiB body |
 * |---|---|---|
 * | yes | yes | accepted  (what we ship)        |
 * | yes | no  | accepted                       |
 * | no  | yes | accepted                       |
 * | no  | no  | **413 — this test goes red**   |
 *
 * Both SDK bounds are documented as not applying to a body handed over as
 * `parsedBody`, and the route always hands `req.body` over, so today the
 * option is a second line rather than the active one — deleting it alone does
 * not change behaviour. It stops being inert the moment anything stops passing
 * the parsed body (dropping `express.json()`, streaming an upload, a future
 * refactor of the route), and that is the combination this test catches. Which
 * of the two protections is load-bearing matters less than that at least one
 * always is.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type http from 'node:http';
import request from 'supertest';
import { setupStreamableHttpTransport } from './streamableHttp.js';
import { createServer } from '../server.js';
import { setTestEnv } from '../utils/test-helpers.js';

setTestEnv();
const previousOAuth = process.env.QASE_OAUTH_ENABLED;
let app: ReturnType<typeof setupStreamableHttpTransport>;

const MIB = 1024 * 1024;
const PAYLOAD_TOO_LARGE = 413;

beforeAll(() => {
  process.env.QASE_OAUTH_ENABLED = 'false';
  app = setupStreamableHttpTransport(createServer, {
    port: 0,
    host: '127.0.0.1',
    endpoint: '/mcp',
  });
});

afterAll(async () => {
  const httpServer = (app as unknown as { _httpServer?: http.Server })._httpServer;
  if (httpServer) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  if (previousOAuth === undefined) delete process.env.QASE_OAUTH_ENABLED;
  else process.env.QASE_OAUTH_ENABLED = previousOAuth;
});

/** A well-formed JSON-RPC request padded out to roughly `sizeMib` megabytes. */
function paddedCall(sizeMib: number): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'qase_attachment_upload',
      arguments: { content: 'A'.repeat(sizeMib * MIB) },
    },
  });
}

describe('request body limit on /mcp', () => {
  it('accepts a body over the SDK 4 MiB default and under our 10 MB one', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', 'Bearer test-token')
      .send(paddedCall(6));

    expect(res.status).not.toBe(PAYLOAD_TOO_LARGE);
  }, 30000);

  it('still rejects a body over the configured limit', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', 'Bearer test-token')
      .send(paddedCall(12));

    expect(res.status).toBe(PAYLOAD_TOO_LARGE);
    // …as a JSON-RPC error, not an express HTML page (see json-parse-error.ts).
    expect(res.body?.error?.code).toBe(-32600);
  }, 30000);
});
