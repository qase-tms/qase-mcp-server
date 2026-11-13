// src/transports/streamableHttp.oauth.test.ts
import { describe, it, expect, beforeAll, jest } from '@jest/globals';
import type http from 'node:http';
import request from 'supertest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { Server } from '@modelcontextprotocol/server';
import type { JWTVerifyGetKey } from 'jose';
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
  // This file is the one that needs OAuth ON. Another test file in the same
  // jest worker may have left QASE_OAUTH_ENABLED=false behind (several set it
  // at module scope), and getOAuthConfig() reads it — with it off, the PRM
  // routes and the guard below are never mounted and every assertion here
  // fails for a reason that has nothing to do with OAuth.
  delete process.env.QASE_OAUTH_ENABLED;

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
    .setAudience(config.audience[0])
    .setExpirationTime('1h')
    .sign(kp.privateKey as CryptoKey);

  // port 0 → ephemeral; we only drive the app via supertest.
  app = setupStreamableHttpTransport(
    makeServer,
    { port: 0, host: '127.0.0.1', endpoint: '/mcp' },
    {
      config,
      verifier,
    },
  );
});

describe('streamable-http OAuth wiring', () => {
  it('serves RFC 9728 protected-resource metadata at the root (backward compat)', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.body.resource.replace(/\/$/, '')).toBe('https://mcp.qase.io');
    // authorization_servers must equal the AS issuer EXACTLY — no trailing slash, so a
    // strict client's RFC 8414 issuer match against the AS metadata succeeds.
    expect(res.body.authorization_servers).toEqual(['https://auth.qase.io']);
  });

  it('serves path-aware protected-resource metadata for the /mcp endpoint (VS Code)', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource/mcp');
    expect(res.status).toBe(200);
    expect(res.body.resource).toBe('https://mcp.qase.io/mcp');
    expect(res.body.authorization_servers).toEqual(['https://auth.qase.io']);
  });

  it('emits authorization_servers with no trailing slash on either PRM document', async () => {
    for (const path of [
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]) {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.body.authorization_servers[0].endsWith('/')).toBe(false);
    }
  });

  it('rejects /mcp without a token (401 + path-aware WWW-Authenticate)', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain(
      'resource_metadata="https://mcp.qase.io/.well-known/oauth-protected-resource/mcp"',
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
    // What this guards is that a valid JWT gets PAST the guard — it used to be
    // asserted through the session header the transport handed back. Serving is
    // per-request now and no session is ever created, so the proof is the
    // answer itself: an initialize result rather than a 401.
    expect(res.headers['mcp-session-id']).toBeUndefined();
    expect(res.text).toContain('protocolVersion');
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

  it('serves AS metadata whose issuer matches the upstream issuer exactly (no trailing slash)', async () => {
    // Passport's RFC 9207 `iss` is its issuer without a slash; an SDK client that
    // discovered the AS through this document compares the two byte for byte.
    const res = await request(app).get('/.well-known/oauth-authorization-server');
    expect(res.status).toBe(200);
    expect(res.body.issuer).toBe('https://auth.qase.io');
    expect(res.body.authorization_endpoint).toBe('https://mcp.qase.io/authorize');
    expect(res.body.registration_endpoint).toBe('https://mcp.qase.io/register');
    expect(res.body.authorization_response_iss_parameter_supported).toBe(false);
  });

  it('puts the unslashed issuer into iss on its own /authorize error redirects', async () => {
    const res = await request(app).get('/authorize').query({
      client_id: 'cli-1',
      redirect_uri: 'https://client.example/callback',
      response_type: 'code',
    });
    expect(res.status).toBe(302);
    const loc = new URL(res.headers['location'] as string);
    expect(loc.origin + loc.pathname).toBe('https://client.example/callback');
    expect(loc.searchParams.get('error')).toBe('invalid_request');
    expect(loc.searchParams.get('iss')).toBe('https://auth.qase.io');
  });

  it('relays an upstream DCR rejection from /register as 400, not an opaque 500', async () => {
    // The proxy captures globalThis.fetch when the app is built, so stub it first.
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'invalid_redirect_uri',
          error_description: 'The selected redirect_uris is invalid.',
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );
    const config = getOAuthConfig();
    const proxiedApp = setupStreamableHttpTransport(
      makeServer,
      { port: 0, host: '127.0.0.1', endpoint: '/mcp' },
      { config, verifier: createJwksVerifier(config, createLocalJWKSet({ keys: [] })) },
    );
    try {
      const res = await request(proxiedApp)
        .post('/register')
        .send({
          client_name: 'windsurf',
          redirect_uris: ['http://127.0.0.1:54321/oauth/callback'],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: 'invalid_redirect_uri',
        error_description: 'The selected redirect_uris is invalid.',
      });
    } finally {
      fetchSpy.mockRestore();
      const httpServer = (proxiedApp as unknown as { _httpServer?: http.Server })._httpServer;
      if (httpServer) await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  // The 404-for-an-unknown-session rule is gone with the sessions themselves:
  // there is no session to be unknown, so a request carrying a stale header
  // from a pre-upgrade client is simply served, and the client never has to
  // re-initialize. That is the point of the era change, not a regression.
  it('serves a request that still carries a stale session id instead of rejecting it', async () => {
    const res = await request(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${validJwt}`)
      .set('Accept', 'application/json, text/event-stream')
      .set('mcp-session-id', 'nonexistent-session-id')
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
    expect(res.status).toBe(200);
  });
});
