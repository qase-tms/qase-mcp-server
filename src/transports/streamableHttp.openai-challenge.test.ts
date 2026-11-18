/**
 * The OpenAI plugin directory verifies the domain by fetching
 * `/.well-known/openai-apps-challenge` and comparing the body with the token
 * from its portal, byte for byte. Without the token configured the route
 * must not exist at all, so self-run deployments are unaffected.
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import type http from 'node:http';
import request from 'supertest';
import { Server } from '@modelcontextprotocol/server';
import { setupStreamableHttpTransport } from './streamableHttp.js';

const previousOAuth = process.env.QASE_OAUTH_ENABLED;
const previousToken = process.env.OPENAI_APPS_CHALLENGE_TOKEN;

// The setup starts listening on its own; each server is closed after its test.
const servers: http.Server[] = [];

function makeApp() {
  process.env.QASE_OAUTH_ENABLED = 'false';
  const app = setupStreamableHttpTransport(
    () => new Server({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } }),
    { port: 0, host: '127.0.0.1', endpoint: '/mcp' },
  );
  servers.push((app as unknown as { _httpServer: http.Server })._httpServer);
  return app;
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((srv) => new Promise<void>((resolve) => srv.close(() => resolve()))),
  );
  restore('QASE_OAUTH_ENABLED', previousOAuth);
  restore('OPENAI_APPS_CHALLENGE_TOKEN', previousToken);
});

describe('/.well-known/openai-apps-challenge', () => {
  it('returns exactly the configured token as plain text', async () => {
    process.env.OPENAI_APPS_CHALLENGE_TOKEN = '  abc123-token\n';
    const res = await request(makeApp()).get('/.well-known/openai-apps-challenge');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).toBe('abc123-token');
  });

  it('does not exist when no token is configured', async () => {
    delete process.env.OPENAI_APPS_CHALLENGE_TOKEN;
    const res = await request(makeApp()).get('/.well-known/openai-apps-challenge');

    expect(res.status).toBe(404);
  });
});
