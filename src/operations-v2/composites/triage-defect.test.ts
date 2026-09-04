/**
 * Tests for qase_triage_defect.
 *
 * The tool used to accept run_id and failed_result_ids, drop them on the floor,
 * and then report "Linked results: N" as if the linking had happened. The API
 * offers no way to attach runs or results to a defect at all.
 */

import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockCreateDefect = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    defects: { createDefect: mockCreateDefect },
  }),
}));

import './triage-defect.js';
import { toolRegistry } from '../../utils/registry.js';
import { __setCaseEnumCacheForTest } from '../../utils/case-enums.js';

// The severity label is mapped to the workspace's numeric ID before the API
// call; seed the map so the mapping runs without reaching for system fields.
beforeAll(async () => {
  await __setCaseEnumCacheForTest({
    severity: { blocker: 1, critical: 2, major: 3, normal: 4, minor: 5, trivial: 6 },
  });
});

function invoke(args: Record<string, unknown>) {
  const handler = toolRegistry.getHandler('qase_triage_defect')!;
  return handler(args);
}

const validArgs = {
  code: 'DEMO',
  title: 'Checkout fails on empty cart',
  actual_result: 'HTTP 500',
  severity: 'blocker',
};

function summaryText(result: any): string {
  return result.content.map((b: any) => b.text).join('\n');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateDefect.mockReturnValue(
    Promise.resolve({ data: { status: true, result: { id: 42 } } }),
  );
});

describe('qase_triage_defect — no phantom linking', () => {
  it('does not claim to have linked results', async () => {
    const result = await invoke(validArgs);

    expect(summaryText(result)).not.toContain('Linked results');
    expect(result.structuredContent).not.toHaveProperty('linked_results');
  });

  it('reports the created defect', async () => {
    const result = await invoke(validArgs);

    expect(result.structuredContent.defect_id).toBe(42);
    expect(summaryText(result)).toContain('Defect ID:** 42');
  });

  it('rejects run_id and failed_result_ids rather than silently ignoring them', () => {
    const schema = toolRegistry.getTool('qase_triage_defect')!.inputSchema as any;

    // The API has no field for either, so the tool must not advertise them.
    expect(Object.keys(schema.properties)).not.toContain('run_id');
    expect(Object.keys(schema.properties)).not.toContain('failed_result_ids');
  });

  it('does not promise linking in its description', () => {
    const description = toolRegistry.getTool('qase_triage_defect')!.description!;

    expect(description).toContain('no way to attach');
  });
});

describe('qase_triage_defect — API-required fields', () => {
  it('requires title, actual_result, and severity', () => {
    const schema = toolRegistry.getTool('qase_triage_defect')!.inputSchema as any;

    // POST /v1/defect/{code} requires all three; marking them optional only
    // produced requests the API rejects.
    expect(schema.required).toContain('title');
    expect(schema.required).toContain('actual_result');
    expect(schema.required).toContain('severity');
  });

  // Severity goes out as the workspace's numeric ID. Forwarding the label,
  // which this asserted before, meant the API answered "Data is invalid" to
  // every call — the tool could not file a single defect.
  it('forwards the defect payload with severity as a numeric ID', async () => {
    await invoke({ ...validArgs, tags: ['checkout'] });

    expect(mockCreateDefect).toHaveBeenCalledWith('DEMO', {
      title: validArgs.title,
      actual_result: validArgs.actual_result,
      severity: 1,
      tags: ['checkout'],
    });
  });
});
