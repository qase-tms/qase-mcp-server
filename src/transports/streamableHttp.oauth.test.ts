// src/transports/streamableHttp.oauth.test.ts
import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import type { JWTVerifyGetKey } from 'jose';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupStreamableHttpTransport } from './streamableHttp.js';
import { createJwksVerifier } from '../auth/jwks-verifier.js';
import { getOAuthConfig } from '../auth/oauth-config.js';

function makeServer(): Server {
  const server = new Server({ name: 'test', version: '0.0.0' }, { capabilities: { tools: {} } });
  return server;
}

let app: ReturnType<typeof setupStreamableHttpTransport>;
let validJwt: string;

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  const jwk = await exportJWK(kp.publicKey);
  jwk.kid = 'k1';
  jwk.alg = 'RS256';
  const resolver: JWTVerifyGetKey = createLocalJWKSet({ keys: [jwk] });
  const config = getOAuthConfig();
  const verifier = createJwksVerifier(config, resolver);

  validJwt = await new SignJWT({ client_id: 'cli-1', scope: 'read' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuedAt()
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setExpirationTime('1h')
    .sign(kp.privateKey as CryptoKey);

  // port 0 → ephemeral; we only drive the app via supertest.
  app = setupStreamableHttpTransport(makeServer, { port: 0, host: '127.0.0.1', endpoint: '/mcp' }, {
    config,
    verifier,
  });
});

describe('streamable-http OAuth wiring', () => {
  it('serves RFC 9728 protected-resource metadata', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.body.resource.replace(/\/$/, '')).toBe('https://mcp.qase.io');
    expect(Array.isArray(res.body.authorization_servers)).toBe(true);
  });

  it('rejects /mcp without a token (401 + WWW-Authenticate)', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain(
      'resource_metadata="https://mcp.qase.io/.well-known/oauth-protected-resource"',
    );
  });

  it('rejects /mcp with an invalid JWT', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer aaa.bbb.ccc')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(res.status).toBe(401);
  });

  it('accepts /mcp initialize with a valid JWT', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${validJwt}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '0.0.0' },
        },
      });
    expect(res.status).toBe(200);
    expect(res.headers['mcp-session-id']).toBeDefined();
  });

  it('proxies /authorize to auth.qase.io echoing the requested redirect_uri', async () => {
    const res = await request(app).get('/authorize').query({
      client_id: 'cli-1',
      redirect_uri: 'https://client.example/callback',
      response_type: 'code',
      code_challenge: 'abc123def456',
      code_challenge_method: 'S256',
    });
    expect(res.status).toBe(302);
    const loc = res.headers['location'] as string;
    expect(loc.startsWith('https://auth.qase.io/oauth/authorize')).toBe(true);
    expect(loc).toContain('client_id=cli-1');
    expect(loc).toContain('redirect_uri=https%3A%2F%2Fclient.example%2Fcallback');
  });
});
