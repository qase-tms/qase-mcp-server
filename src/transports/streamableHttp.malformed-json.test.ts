/**
 * A malformed request body must not reach express's default error handler.
 *
 * Body parsing happens before the auth guard, so anyone who can reach the port
 * — with no token at all — could trigger the default handler and read back an
 * HTML page carrying a stack trace with absolute node_modules paths. The MCP
 * answer to unparsable JSON is JSON-RPC -32700.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { Server } from "@modelcontextprotocol/server";
import { setupStreamableHttpTransport } from './streamableHttp.js';
import { setTestEnv } from '../utils/test-helpers.js';

setTestEnv();
const previousOAuth = process.env.QASE_OAUTH_ENABLED;

function makeServer(): Server {
  return new Server({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
}

let app: ReturnType<typeof setupStreamableHttpTransport>;

beforeAll(() => {
  process.env.QASE_OAUTH_ENABLED = 'false';
  app = setupStreamableHttpTransport(makeServer, { port: 0, host: '127.0.0.1', endpoint: '/mcp' });
});

afterAll(() => {
  if (previousOAuth === undefined) delete process.env.QASE_OAUTH_ENABLED;
  else process.env.QASE_OAUTH_ENABLED = previousOAuth;
});

describe('malformed JSON body', () => {
  const PARSE_ERROR = -32700;
  const malformed = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{';

  it('answers with a JSON-RPC parse error', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(malformed);

    expect(res.status).toBe(400);
    expect(res.body?.error?.code).toBe(PARSE_ERROR);
  });

  it('leaks no stack trace to an unauthenticated caller', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send(malformed);

    expect(res.text ?? '').not.toMatch(/node_modules|SyntaxError|\bat \//);
  });
});
