// src/transports/rate-limit.test.ts
import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { createMcpRateLimiter, readRateLimitPerMinute } from './rate-limit.js';

function buildApp(perMinute: number) {
  const app = express();
  app.post('/mcp', createMcpRateLimiter(perMinute), (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('readRateLimitPerMinute', () => {
  it('defaults to 600 when unset', () => {
    expect(readRateLimitPerMinute({})).toBe(600);
  });

  it('reads a numeric override', () => {
    expect(readRateLimitPerMinute({ QASE_MCP_RATE_LIMIT_PER_MINUTE: '120' })).toBe(120);
  });

  it('treats 0 as disabled', () => {
    expect(readRateLimitPerMinute({ QASE_MCP_RATE_LIMIT_PER_MINUTE: '0' })).toBe(0);
  });

  it('falls back to the default on garbage rather than failing startup', () => {
    expect(readRateLimitPerMinute({ QASE_MCP_RATE_LIMIT_PER_MINUTE: 'lots' })).toBe(600);
    expect(readRateLimitPerMinute({ QASE_MCP_RATE_LIMIT_PER_MINUTE: '-5' })).toBe(600);
  });
});

describe('createMcpRateLimiter', () => {
  it('lets requests through while under the budget', async () => {
    const app = buildApp(2);
    expect((await request(app).post('/mcp').send({})).status).toBe(200);
    expect((await request(app).post('/mcp').send({})).status).toBe(200);
  });

  it('answers 429 with a JSON-RPC error once the budget is spent', async () => {
    const app = buildApp(1);
    await request(app).post('/mcp').send({});

    const res = await request(app).post('/mcp').send({});

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32000, message: 'Too many requests' },
    });
  });

  it('is a pass-through when disabled', async () => {
    const app = buildApp(0);
    for (let i = 0; i < 5; i++) {
      expect((await request(app).post('/mcp').send({})).status).toBe(200);
    }
  });
});
