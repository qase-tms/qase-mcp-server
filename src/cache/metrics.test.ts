import { Metrics } from './metrics.js';

describe('Metrics', () => {
  let m: Metrics;

  beforeEach(() => {
    m = new Metrics();
  });

  it('increments a counter starting from zero', () => {
    m.incCounter('cache_hits_total', { tier: 'l1' });
    m.incCounter('cache_hits_total', { tier: 'l1' });
    expect(m.getCounter('cache_hits_total', { tier: 'l1' })).toBe(2);
  });

  it('tracks counters with different label values independently', () => {
    m.incCounter('cache_hits_total', { tier: 'l1' });
    m.incCounter('cache_hits_total', { tier: 'l2' });
    expect(m.getCounter('cache_hits_total', { tier: 'l1' })).toBe(1);
    expect(m.getCounter('cache_hits_total', { tier: 'l2' })).toBe(1);
  });

  it('sets a gauge to a specific value', () => {
    m.setGauge('cache_entries', { tier: 'l1' }, 42);
    m.setGauge('cache_entries', { tier: 'l1' }, 100);
    expect(m.getGauge('cache_entries', { tier: 'l1' })).toBe(100);
  });

  it('renders Prometheus text with HELP and TYPE lines for each metric', () => {
    m.registerCounter('qase_mcp_cache_hits_total', 'Cache hits by tier');
    m.registerGauge('qase_mcp_cache_entries', 'Current live entries by tier');
    m.incCounter('qase_mcp_cache_hits_total', { tier: 'l1' });
    m.setGauge('qase_mcp_cache_entries', { tier: 'l1' }, 42);

    const text = m.renderPrometheus();
    expect(text).toContain('# HELP qase_mcp_cache_hits_total Cache hits by tier');
    expect(text).toContain('# TYPE qase_mcp_cache_hits_total counter');
    expect(text).toContain('qase_mcp_cache_hits_total{tier="l1"} 1');
    expect(text).toContain('# TYPE qase_mcp_cache_entries gauge');
    expect(text).toContain('qase_mcp_cache_entries{tier="l1"} 42');
  });

  it('renders metrics without labels', () => {
    m.registerCounter('process_starts_total', 'Process start count');
    m.incCounter('process_starts_total', {});
    const text = m.renderPrometheus();
    expect(text).toContain('process_starts_total 1');
  });

  it('escapes quotes and backslashes in label values', () => {
    m.registerCounter('x_total', 'x');
    m.incCounter('x_total', { path: 'a"b\\c' });
    const text = m.renderPrometheus();
    expect(text).toContain('x_total{path="a\\"b\\\\c"} 1');
  });
});
