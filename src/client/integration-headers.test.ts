/**
 * Integration Marker Attribution Tests
 *
 * Like user-agent.test.ts, these run against a real local HTTP server and assert
 * what actually reaches the wire. The generated SDK merges its own headers over
 * the axios instance defaults on the way out, so asserting on our own config
 * would not prove the outbound request is what we think it is — and this axis has
 * to coexist with two others (the User-Agent source and X-MCP-Client-*) without
 * disturbing either.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { QaseApiClient } from './index.js';
import { VERSION } from '../version.js';
import { serverStorage } from '../utils/server-context.js';
import { integrationStorage } from '../utils/integration-context.js';

const OPAQUE = 'opaque-token-123';

let server: http.Server;
let host: string;
let received: Array<http.IncomingHttpHeaders> = [];

function serverWithClient(name: string, version: string): Server {
  return { getClientVersion: () => ({ name, version }) } as unknown as Server;
}

/** Run an SDK call under a given AI host identity and integration marker. */
async function call(marker: string | undefined): Promise<void> {
  const client = new QaseApiClient({ token: OPAQUE, host });
  const invoke = () => client.projects.getProjects(10, 0);
  await serverStorage.run(serverWithClient('claude-ai', '1.2.3'), () =>
    marker === undefined ? invoke() : integrationStorage.run(marker, invoke),
  );
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    received.push(req.headers);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: true, result: { entities: [], total: 0 } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  received = [];
  delete process.env.QASE_MCP_INTEGRATION;
});

describe('integration marker on the wire', () => {
  it('adds X-MCP-Integration-* while leaving User-Agent and X-MCP-Client-* untouched', async () => {
    await call('quality-supervisor/1.4.0');

    expect(received).toHaveLength(1);
    const headers = received[0];

    // The new axis.
    expect(headers['x-mcp-integration-name']).toBe('quality-supervisor');
    expect(headers['x-mcp-integration-version']).toBe('1.4.0');

    // The two existing axes, unchanged. The backend gates hosted access on an
    // exact-equality check against the User-Agent source, so this must not drift.
    expect(headers['user-agent']).toBe(`qase-mcp/${VERSION}`);
    expect(headers['user-agent']).not.toContain('qase-api-client-js');
    expect(headers['x-mcp-client-name']).toBe('claude-ai');
    expect(headers['x-mcp-client-version']).toBe('1.2.3');
  });

  it('sends no integration headers when no marker is supplied', async () => {
    await call(undefined);

    const headers = received[0];
    expect(headers['x-mcp-integration-name']).toBeUndefined();
    expect(headers['x-mcp-integration-version']).toBeUndefined();
    // The other two axes are unaffected by the marker being absent.
    expect(headers['user-agent']).toBe(`qase-mcp/${VERSION}`);
    expect(headers['x-mcp-client-name']).toBe('claude-ai');
  });

  it('drops a non-allowlisted marker silently and still completes the request', async () => {
    await call('some-random-plugin/9.9.9');

    expect(received).toHaveLength(1);
    expect(received[0]['x-mcp-integration-name']).toBeUndefined();
    expect(received[0]['user-agent']).toBe(`qase-mcp/${VERSION}`);
  });

  it('sends the name only when the version is malformed', async () => {
    await call('quality-supervisor/not a version');

    expect(received[0]['x-mcp-integration-name']).toBe('quality-supervisor');
    expect(received[0]['x-mcp-integration-version']).toBeUndefined();
  });

  it('falls back to QASE_MCP_INTEGRATION on the stdio path (no request context)', async () => {
    process.env.QASE_MCP_INTEGRATION = 'quality-supervisor/3.0.0';

    const client = new QaseApiClient({ token: OPAQUE, host });
    await client.projects.getProjects(10, 0); // outside any integrationStorage scope

    expect(received[0]['x-mcp-integration-name']).toBe('quality-supervisor');
    expect(received[0]['x-mcp-integration-version']).toBe('3.0.0');
  });

  it('applies to the direct request() escape hatch too', async () => {
    const client = new QaseApiClient({ token: OPAQUE, host });
    await integrationStorage.run('quality-supervisor/1.4.0', () => client.request('/v1/project'));

    expect(received[0]['x-mcp-integration-name']).toBe('quality-supervisor');
    expect(received[0]['x-mcp-integration-version']).toBe('1.4.0');
    expect(received[0]['user-agent']).toBe(`qase-mcp/${VERSION}`);
  });
});
