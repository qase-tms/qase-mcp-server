/**
 * User-Agent Attribution Tests
 *
 * Qase attributes the request source by User-Agent, so these run against a real
 * local HTTP server and assert what actually reaches the wire — the header is
 * rewritten by both the axios instance and the generated SDK on the way out, and
 * asserting on our own config would not catch the SDK winning that merge.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTestEnv, clearTestEnv } from '../utils/test-helpers.js';

jest.mock('../utils/auth-context.js', () => ({
  requestTokenStorage: { getStore: jest.fn(() => undefined) },
  getEffectiveToken: jest.fn(() => process.env.QASE_API_TOKEN ?? 'test-token'),
}));

let server: http.Server;
let received: Array<{ path: string; userAgent?: string }> = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    received.push({ path: req.url ?? '', userAgent: req.headers['user-agent'] });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: true, result: { entities: [], total: 0 } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('User-Agent attribution', () => {
  beforeEach(() => {
    setTestEnv();
    received = [];
    const { port } = server.address() as AddressInfo;
    process.env.QASE_API_DOMAIN = `127.0.0.1:${port}`;
    process.env.QASE_API_PROTOCOL = 'http';
  });

  afterEach(async () => {
    clearTestEnv();
    delete process.env.QASE_MCP_SOURCE;
    jest.resetModules();
  });

  it('sends the MCP source on SDK calls, not the SDK client version', async () => {
    const { getApiClient } = await import('./index.js');
    const { VERSION } = await import('../version.js');

    await getApiClient().projects.getProjects(10, 0);

    expect(received).toHaveLength(1);
    expect(received[0].userAgent).toBe(`qase-mcp/${VERSION}`);
    expect(received[0].userAgent).not.toContain('qase-api-client-js');
  });

  it('sends the MCP source on direct request() calls', async () => {
    const { getApiClient } = await import('./index.js');
    const { VERSION } = await import('../version.js');

    await getApiClient().request('/v1/project');

    expect(received).toHaveLength(1);
    expect(received[0].userAgent).toBe(`qase-mcp/${VERSION}`);
  });

  it('reports the hosted deployment separately via QASE_MCP_SOURCE', async () => {
    process.env.QASE_MCP_SOURCE = 'qase-mcp-hosted';

    const { getApiClient } = await import('./index.js');
    const { VERSION } = await import('../version.js');

    await getApiClient().projects.getProjects(10, 0);

    expect(received[0].userAgent).toBe(`qase-mcp-hosted/${VERSION}`);
  });
});
