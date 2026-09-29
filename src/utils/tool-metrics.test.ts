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

  it('renders both counters in the Prometheus output', () => {
    getMetrics().incCounter('qase_mcp_tool_calls_total', { tool: 'qase_get' });
    getMetrics().incCounter('qase_mcp_tool_activations_total', { tool: 'qase_case_delete' });

    const text = getMetrics().renderPrometheus();
    expect(text).toContain('qase_mcp_tool_calls_total');
    expect(text).toContain('qase_mcp_tool_activations_total');
    expect(text).toContain('tool="qase_case_delete"');
  });
});
