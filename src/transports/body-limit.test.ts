import { describe, it, expect } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { readBodyLimit, bodyLimitBytes } from './body-limit.js';
import { createJsonParseErrorHandler } from './json-parse-error.js';

describe('readBodyLimit', () => {
  it('defaults to 10mb', () => {
    expect(readBodyLimit({})).toBe('10mb');
  });

  it('reads a numeric override in megabytes', () => {
    expect(readBodyLimit({ QASE_MCP_BODY_LIMIT_MB: '32' })).toBe('32mb');
  });

  it('ignores a non-numeric or zero override rather than disabling the limit', () => {
    expect(readBodyLimit({ QASE_MCP_BODY_LIMIT_MB: 'lots' })).toBe('10mb');
    expect(readBodyLimit({ QASE_MCP_BODY_LIMIT_MB: '0' })).toBe('10mb');
  });
});

/**
 * express.json() reads the limit as a string, the MCP handler and the Node
 * adapter read it as a number of bytes. Two readers of one setting is exactly
 * how the 4 MiB SDK default crept back in once before, so they are pinned to
 * each other here rather than only to their own expectations.
 */
describe('bodyLimitBytes agrees with readBodyLimit', () => {
  const MB = 1024 * 1024;

  function megabytesIn(limit: string): number {
    const match = /^(\d+)mb$/.exec(limit);
    if (!match) throw new Error(`readBodyLimit returned an unparsable limit: ${limit}`);
    return Number(match[1]);
  }

  it.each([
    ['the default', {}],
    ['an override', { QASE_MCP_BODY_LIMIT_MB: '32' }],
    ['a non-numeric override', { QASE_MCP_BODY_LIMIT_MB: 'lots' }],
    ['a zero override', { QASE_MCP_BODY_LIMIT_MB: '0' }],
  ])('reports the same cap as %s', (_label, env) => {
    expect(bodyLimitBytes(env)).toBe(megabytesIn(readBodyLimit(env)) * MB);
  });

  it('is a positive number of bytes, as both SDK options require', () => {
    expect(bodyLimitBytes({})).toBe(10 * MB);
    expect(bodyLimitBytes({})).toBeGreaterThan(0);
  });
});

describe('oversized body handling', () => {
  const INVALID_REQUEST = -32600;

  function buildApp() {
    const app = express();
    app.use(express.json({ limit: '1kb' }));
    app.use(createJsonParseErrorHandler());
    app.post('/mcp', (_req, res) => {
      res.status(200).json({ ok: true });
    });
    return app;
  }

  it('answers with a JSON-RPC error rather than express HTML', async () => {
    const res = await request(buildApp())
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ jsonrpc: '2.0', id: 1, params: { blob: 'x'.repeat(4096) } }));

    expect(res.status).toBe(413);
    expect(res.body?.error?.code).toBe(INVALID_REQUEST);
  });

  it('leaks no stack trace to an unauthenticated caller', async () => {
    const res = await request(buildApp())
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ jsonrpc: '2.0', id: 1, params: { blob: 'x'.repeat(4096) } }));

    expect(res.text ?? '').not.toMatch(/node_modules|PayloadTooLargeError|\bat \//);
  });

  it('still lets a body under the limit through', async () => {
    const res = await request(buildApp())
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ jsonrpc: '2.0', id: 1 }));

    expect(res.status).toBe(200);
  });
});
