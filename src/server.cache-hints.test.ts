/**
 * Cache hints (SEP-2549), protocol revision 2026-07-28.
 *
 * `cacheHints` is a `ServerOptions` option (the second argument to
 * `new Server(...)`): a per-operation `{ ttlMs, cacheScope }` fallback the SDK
 * fills onto a cacheable result when the handler does not set the fields
 * itself. Six operations are cacheable on this revision (`tools/list`,
 * `prompts/list`, `resources/list`, `resources/templates/list`,
 * `resources/read`, `server/discover`); the fields default to
 * `{ ttlMs: 0, cacheScope: 'private' }` when no hint is configured.
 *
 * Note on where the fields land on the wire. The plan's draft of this test
 * expected `result._meta?.['io.modelcontextprotocol/cache']`. That key does
 * not exist: `ttlMs` and `cacheScope` are required, TOP-LEVEL fields on the
 * cacheable result itself (see `ListToolsResultSchema` / `ListPromptsResultSchema`
 * in `@modelcontextprotocol/server`'s wire schemas — both extend their base
 * result with `ttlMs`/`cacheScope` alongside `tools`/`prompts`, not inside
 * `_meta`). So this test reads them straight off the result, the way the
 * client's own schema validates them.
 *
 * The era is asked for the way `streamableHttp.era.test.ts` asks for it: the
 * SDK client's `versionNegotiation: { mode: 'auto' }` option, not an
 * `initialize` naming 2026-07-28 (the SDK classifies `initialize` as the
 * legacy handshake by definition).
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { setupStreamableHttpTransport } from './transports/streamableHttp.js';
import { createServer } from './server.js';
import { setTestEnv } from './utils/test-helpers.js';

setTestEnv();
const previousOAuth = process.env.QASE_OAUTH_ENABLED;
let app: ReturnType<typeof setupStreamableHttpTransport>;
let baseUrl: URL;
let client: Client;

beforeAll(async () => {
  process.env.QASE_OAUTH_ENABLED = 'false';
  app = setupStreamableHttpTransport(createServer, {
    port: 0,
    host: '127.0.0.1',
    endpoint: '/mcp',
  });

  const httpServer = (app as unknown as { _httpServer: http.Server })._httpServer;
  if (!httpServer.listening) {
    await new Promise<void>((resolve) => httpServer.once('listening', () => resolve()));
  }
  baseUrl = new URL(`http://127.0.0.1:${(httpServer.address() as AddressInfo).port}/mcp`);

  client = new Client({ name: 't', version: '1' }, { versionNegotiation: { mode: 'auto' } });
  await client.connect(
    new StreamableHTTPClientTransport(baseUrl, {
      requestInit: { headers: { Authorization: 'Bearer test-token' } },
    }),
  );
}, 30000);

afterAll(async () => {
  await client.close().catch(() => {});
  const httpServer = (app as unknown as { _httpServer?: http.Server })._httpServer;
  if (httpServer) {
    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
  if (previousOAuth === undefined) delete process.env.QASE_OAUTH_ENABLED;
  else process.env.QASE_OAUTH_ENABLED = previousOAuth;
}, 30000);

describe('cache hints on the wire', () => {
  it('marks the tool list private and uncacheable', async () => {
    const result = await client.listTools();
    expect(result).toMatchObject({ ttlMs: 0, cacheScope: 'private' });
  });

  it('lets a shared cache hold the prompt catalog', async () => {
    const result = await client.listPrompts();
    expect(result).toMatchObject({ ttlMs: 300_000, cacheScope: 'public' });
  });
});
