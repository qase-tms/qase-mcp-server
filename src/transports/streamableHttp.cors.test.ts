/**
 * CORS on the streamable-http app as a whole.
 *
 * The CORS middleware is `app.use(...)` with no path, so it answers the
 * preflight for every route on this Express app — not just `/mcp`. `/mcp` is
 * the only route that ever served `DELETE`, and that operation went away with
 * sessions, but `/health`, `/metrics`, and the OAuth well-known/metadata
 * routes are all `GET`. A cross-origin `GET` carrying a non-simple header
 * (`Authorization` above all) is preflighted, and if the preflight's
 * `Access-Control-Allow-Methods` omits `GET`, the browser refuses the request
 * before it is ever sent — even though the server would have answered it.
 *
 * This pins `GET` staying advertised app-wide, on a route other than `/mcp`.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type http from 'node:http';
import request from 'supertest';
import { Server } from '@modelcontextprotocol/server';

let app: ReturnType<typeof import('./streamableHttp.js').setupStreamableHttpTransport>;
const previousOAuth = process.env.QASE_OAUTH_ENABLED;

function makeServer(): Server {
  return new Server({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
}

beforeAll(async () => {
  process.env.QASE_OAUTH_ENABLED = 'false';
  const { setupStreamableHttpTransport } = await import('./streamableHttp.js');
  app = setupStreamableHttpTransport(makeServer, { port: 0, host: '127.0.0.1', endpoint: '/mcp' });
});

afterAll(async () => {
  const httpServer = (app as unknown as { _httpServer?: http.Server })._httpServer;
  if (httpServer) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  if (previousOAuth === undefined) delete process.env.QASE_OAUTH_ENABLED;
  else process.env.QASE_OAUTH_ENABLED = previousOAuth;
});

describe('CORS on a non-/mcp route', () => {
  it('advertises GET on an OPTIONS preflight to /health', async () => {
    const res = await request(app)
      .options('/health')
      .set('Origin', 'https://example.com')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'Authorization');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-methods']).toMatch(/\bGET\b/);
  });
});
