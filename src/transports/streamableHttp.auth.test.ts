/**
 * streamable-http with OAuth disabled.
 *
 * This configuration had no test at all, which is how it kept an empty guard
 * array: `QASE_OAUTH_ENABLED=false` removed authentication entirely rather than
 * only removing OAuth, and every request then ran under the operator's
 * QASE_API_TOKEN.
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

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  },
};

beforeAll(() => {
  // getOAuthConfig() is read inside setupStreamableHttpTransport, not at import
  // time, so setting this here is enough to build the no-OAuth variant.
  process.env.QASE_OAUTH_ENABLED = 'false';
  app = setupStreamableHttpTransport(makeServer, { port: 0, host: '127.0.0.1', endpoint: '/mcp' });
});

afterAll(() => {
  if (previousOAuth === undefined) delete process.env.QASE_OAUTH_ENABLED;
  else process.env.QASE_OAUTH_ENABLED = previousOAuth;
});

describe('streamable-http without OAuth', () => {
  it('rejects an initialize with no token', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send(initialize);

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_token');
  });

  it('rejects a GET with no token', async () => {
    const res = await request(app).get('/mcp');

    expect(res.status).toBe(401);
  });

  it('rejects a DELETE with no token', async () => {
    const res = await request(app).delete('/mcp');

    expect(res.status).toBe(401);
  });

  // No OAuth is configured here, so a challenge would send the client looking
  // for authorization-server metadata that this deployment does not serve.
  it('does not answer with an OAuth challenge', async () => {
    const res = await request(app).get('/mcp');

    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  it('accepts an initialize that carries a token', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Authorization', 'Bearer operator-token')
      .send(initialize);

    expect(res.status).toBe(200);
  });

  // The Docker HEALTHCHECK calls /health with no credentials.
  it('leaves /health open', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });

  it('leaves /metrics open', async () => {
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
  });
});
