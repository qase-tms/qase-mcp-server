/**
 * Tests for qase_result_record — recording results into an existing run.
 *
 * The bulk endpoint takes at most 200 results per request. Nothing in the
 * schema said so and nothing enforced it, while the description told agents to
 * "pass several results in one call rather than calling once per test" — so a
 * thousand-result batch got an API error back with no hint of the ceiling.
 *
 * The cap is rejected locally rather than chunked. Results are append-only, so
 * a half-written batch cannot be rolled back and a retry records the first
 * chunk twice, leaving the run with a believable but wrong pass rate.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockCreateResult = jest.fn();
const mockCreateResultBulk = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    results: { createResult: mockCreateResult, createResultBulk: mockCreateResultBulk },
  }),
}));

import './results.js';
import { toolRegistry } from '../../utils/registry.js';

function invoke(args: Record<string, unknown>) {
  const handler = toolRegistry.getHandler('qase_result_record')!;
  return handler(args);
}

const passing = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ case_id: i + 1, status: 'passed' }));

const sentResults = () => mockCreateResultBulk.mock.calls[0][2].results as unknown[];

beforeEach(() => {
  mockCreateResult
    .mockReset()
    .mockImplementation(() => Promise.resolve({ data: { result: { hash: 'abc' } } }));
  mockCreateResultBulk.mockReset().mockImplementation(() => Promise.resolve({ data: {} }));
});

describe('qase_result_record — batch ceiling', () => {
  it('accepts exactly 200 results in one bulk request', async () => {
    await invoke({ code: 'DEMO', run_id: 7, results: passing(200) });

    expect(mockCreateResultBulk).toHaveBeenCalledTimes(1);
    expect(sentResults()).toHaveLength(200);
  });

  it('rejects 201 results without calling the API', async () => {
    await expect(invoke({ code: 'DEMO', run_id: 7, results: passing(201) })).rejects.toThrow(/200/);

    expect(mockCreateResultBulk).not.toHaveBeenCalled();
    expect(mockCreateResult).not.toHaveBeenCalled();
  });

  it('tells the caller to split an oversized batch rather than leaving it guessing', async () => {
    await expect(invoke({ code: 'DEMO', run_id: 7, results: passing(500) })).rejects.toThrow(
      /split/i,
    );
  });
});

describe('qase_result_record — routing', () => {
  it('sends a single result to the single-result endpoint', async () => {
    await invoke({ code: 'DEMO', run_id: 7, results: passing(1) });

    expect(mockCreateResult).toHaveBeenCalledTimes(1);
    expect(mockCreateResultBulk).not.toHaveBeenCalled();
  });

  it('sends several results as one bulk request and reports the count', async () => {
    const result = await invoke({ code: 'DEMO', run_id: 7, results: passing(3) });

    expect(mockCreateResultBulk).toHaveBeenCalledTimes(1);
    expect(mockCreateResult).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, count: 3 });
  });
});

describe('qase_result_record — validation', () => {
  it('rejects an empty results array', async () => {
    await expect(invoke({ code: 'DEMO', run_id: 7, results: [] })).rejects.toThrow(/results/i);
    expect(mockCreateResultBulk).not.toHaveBeenCalled();
  });

  it('rejects a result with an unknown status', async () => {
    await expect(
      invoke({ code: 'DEMO', run_id: 7, results: [{ case_id: 1, status: 'flaky' }] }),
    ).rejects.toThrow(/status/i);
    expect(mockCreateResult).not.toHaveBeenCalled();
  });
});
