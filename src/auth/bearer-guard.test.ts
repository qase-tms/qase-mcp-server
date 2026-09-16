/**
 * The guard that stands in for the OAuth guard where OAuth is off.
 *
 * Its job is narrow: make the caller present a token. Whether the token is any
 * good is established by the Qase API, which rejects a bad one — what this
 * closes is the silent fallback to the operator's QASE_API_TOKEN for a request
 * that presented nothing at all.
 */

import { describe, it, expect } from '@jest/globals';
import express, { type Express } from 'express';
import request from 'supertest';
import { createBearerRequiredGuard } from './bearer-guard.js';

function makeApp(): Express {
  const app = express();
  app.get('/mcp', createBearerRequiredGuard(), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('bearer-required guard', () => {
  it('rejects a request with no Authorization header', async () => {
    const res = await request(makeApp()).get('/mcp');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_token');
  });

  it('rejects a Bearer header with nothing after it', async () => {
    const res = await request(makeApp()).get('/mcp').set('Authorization', 'Bearer    ');

    expect(res.status).toBe(401);
  });

  it('rejects an Authorization scheme that is not Bearer', async () => {
    const res = await request(makeApp()).get('/mcp').set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(res.status).toBe(401);
  });

  // WWW-Authenticate is what starts OAuth discovery. This guard only runs where
  // OAuth is off, so sending it would send the client chasing metadata that
  // does not exist — it would fail inside the OAuth flow instead of reading a
  // plain "send a token".
  it('does not send WWW-Authenticate', async () => {
    const res = await request(makeApp()).get('/mcp');

    expect(res.headers['www-authenticate']).toBeUndefined();
  });

  it('says how to fix it', async () => {
    const res = await request(makeApp()).get('/mcp');

    expect(res.body.error_description).toContain('Authorization: Bearer');
    expect(res.body.error_description).toContain('QASE_API_TOKEN');
  });

  it('lets a request carrying a token through', async () => {
    const res = await request(makeApp()).get('/mcp').set('Authorization', 'Bearer tok-1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
