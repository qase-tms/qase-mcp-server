// src/auth/mcp-guard.test.ts
import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createMcpGuard } from './mcp-guard.js';
import type { JwksVerifier } from './jwks-verifier.js';
import type { OAuthConfig } from './oauth-config.js';

const config = { resourceUrl: 'https://mcp.qase.io' } as OAuthConfig;
const EXPECTED_RESOURCE = 'https://mcp.qase.io/.well-known/oauth-protected-resource';

function buildApp(verifier: JwksVerifier) {
  const app = express();
  app.use(express.json());
  app.post('/mcp', createMcpGuard(verifier, config), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

const acceptAll: JwksVerifier = { verifyJwt: async () => ({ token: 't', clientId: 'c', scopes: [] }) };
const rejectAll: JwksVerifier = {
  verifyJwt: async () => {
    throw new Error('invalid');
  },
};

describe('createMcpGuard', () => {
  it('returns 401 with WWW-Authenticate when no token is present', async () => {
    const res = await request(buildApp(acceptAll)).post('/mcp').send({});
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain(`resource_metadata="${EXPECTED_RESOURCE}"`);
  });

  it('returns 401 when a JWT fails validation', async () => {
    const res = await request(buildApp(rejectAll))
      .post('/mcp')
      .set('Authorization', 'Bearer aaa.bbb.ccc')
      .send({});
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toContain(`resource_metadata="${EXPECTED_RESOURCE}"`);
  });

  it('passes a valid JWT through to the handler', async () => {
    const res = await request(buildApp(acceptAll))
      .post('/mcp')
      .set('Authorization', 'Bearer aaa.bbb.ccc')
      .send({});
    expect(res.status).toBe(200);
  });

  it('passes an opaque token through without JWKS validation', async () => {
    const res = await request(buildApp(rejectAll)) // rejectAll proves JWKS is skipped
      .post('/mcp')
      .set('Authorization', 'Bearer opaque-token-123')
      .send({});
    expect(res.status).toBe(200);
  });
});
