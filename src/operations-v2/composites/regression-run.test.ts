/**
 * Tests for qase_regression_run — builds a run from a suite, a plan or an
 * explicit case list.
 *
 * A plan is expanded into cases by Qase, not here, so the count of cases the
 * tool reports has to come from the created run; counting only what the tool
 * resolved itself reported 0 for every plan-based run.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockCreateRun = jest.fn();
const mockGetRun = jest.fn();
const mockGetCases = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    runs: { createRun: mockCreateRun, getRun: mockGetRun },
    cases: { getCases: mockGetCases },
  }),
}));

import './regression-run.js';
import { toolRegistry } from '../../utils/registry.js';

function invoke(args: Record<string, unknown>): Promise<any> {
  const handler = toolRegistry.getHandler('qase_regression_run')!;
  return handler(args) as Promise<any>;
}

const summaryText = (result: any): string => result.content.map((b: any) => b.text).join('\n');

beforeEach(() => {
  mockCreateRun
    .mockReset()
    .mockImplementation(() => Promise.resolve({ data: { result: { id: 5 } } }));
  mockGetRun
    .mockReset()
    .mockImplementation(() => Promise.resolve({ data: { result: { id: 5, cases: [1, 2, 3] } } }));
  mockGetCases
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve({ data: { result: { entities: [{ id: 10 }, { id: 11 }] } } }),
    );
});

describe('qase_regression_run — cases_added', () => {
  it('counts the cases Qase expanded from a plan', async () => {
    const result = await invoke({ code: 'DEMO', title: 'Regression', plan_id: 2 });

    expect(mockGetRun).toHaveBeenCalledWith('DEMO', 5, 'cases');
    expect(result.structuredContent.cases_added).toBe(3);
    expect(summaryText(result)).toContain('**Cases:** 3');
  });

  it('does not read the run back when the tool resolved the cases itself', async () => {
    const result = await invoke({
      code: 'DEMO',
      title: 'Regression',
      suite_ids: [4],
      include_cases: [1],
    });

    expect(mockGetRun).not.toHaveBeenCalled();
    expect(result.structuredContent.cases_added).toBe(3);
  });

  it('still returns the created run when the read-back fails', async () => {
    // The run exists at this point; an error would invite a retry that
    // creates a second one.
    mockGetRun.mockImplementation(() => Promise.reject(new Error('boom')));

    const result = await invoke({ code: 'DEMO', title: 'Regression', plan_id: 2 });

    expect(result.structuredContent.run_id).toBe(5);
    expect(summaryText(result)).toContain('could not be read back');
  });
});
