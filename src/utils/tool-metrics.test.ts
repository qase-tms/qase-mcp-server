import { describe, it, expect, beforeEach } from '@jest/globals';
import { getMetrics, resetMetricsForTest } from '../cache/index.js';

describe('tool call metrics', () => {
  beforeEach(() => resetMetricsForTest());

  it('counts a call per tool name', () => {
    getMetrics().incCounter('qase_mcp_tool_calls_total', { tool: 'qase_get' });
    getMetrics().incCounter('qase_mcp_tool_calls_total', { tool: 'qase_get' });
    getMetrics().incCounter('qase_mcp_tool_calls_total', { tool: 'qql_search' });

    expect(getMetrics().getCounter('qase_mcp_tool_calls_total', { tool: 'qase_get' })).toBe(2);
    expect(getMetrics().getCounter('qase_mcp_tool_calls_total', { tool: 'qql_search' })).toBe(1);
  });

  it('renders the tool-call counter in the Prometheus output', () => {
    getMetrics().incCounter('qase_mcp_tool_calls_total', { tool: 'qase_get' });

    const text = getMetrics().renderPrometheus();
    expect(text).toContain('qase_mcp_tool_calls_total');
    expect(text).toContain('tool="qase_get"');

    // Guards the registration itself, not just the series: incCounter()
    // lazily creates a series for an unregistered name too, so without these
    // assertions the test above stays green even if the registerCounter()
    // call in metrics.ts is removed.
    expect(text).toContain('# HELP qase_mcp_tool_calls_total');
    expect(text).toContain('# TYPE qase_mcp_tool_calls_total counter');
  });
});
