import express from 'express';
import request from 'supertest';
import { getMetrics, resetMetricsForTest } from '../cache/index.js';

function buildApp(): express.Express {
  const app = express();
  app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(getMetrics().renderPrometheus());
  });
  return app;
}

describe('/metrics endpoint', () => {
  beforeEach(() => {
    resetMetricsForTest();
  });
  afterEach(() => {
    resetMetricsForTest();
  });

  it('returns Prometheus text with the default metric registrations', async () => {
    const res = await request(buildApp()).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('# TYPE qase_mcp_cache_hits_total counter');
    expect(res.text).toContain('# TYPE qase_mcp_cache_misses_total counter');
    expect(res.text).toContain('# TYPE qase_mcp_circuit_breaker_state gauge');
  });

  it('reflects subsequent counter increments', async () => {
    const m = getMetrics();
    m.incCounter('qase_mcp_cache_hits_total', { tier: 'l1' });
    const res = await request(buildApp()).get('/metrics');
    expect(res.text).toContain('qase_mcp_cache_hits_total{tier="l1"} 1');
  });
});
