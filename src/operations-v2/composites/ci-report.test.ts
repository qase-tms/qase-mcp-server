/**
 * Tests for qase_ci_report — one call that creates a run, records every
 * result and completes it.
 *
 * The bulk results endpoint takes 200 per request, and a finished CI suite
 * routinely has more than that. Refusing those batches would push the model
 * off the composite and back onto create-run plus N record calls plus
 * complete — exactly the sequence this tool exists to replace — so the batch
 * is split here instead. Splitting is safe in this tool and not in
 * qase_result_record: a retry here builds a new run rather than appending to a
 * real one, so a half-written attempt leaves a junk run behind rather than a
 * live run with a doubled pass rate.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockCreateRun = jest.fn();
const mockCreateResultBulk = jest.fn();
const mockCompleteRun = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    runs: { createRun: mockCreateRun, completeRun: mockCompleteRun },
    results: { createResultBulk: mockCreateResultBulk },
  }),
}));

import './ci-report.js';
import { toolRegistry } from '../../utils/registry.js';

function invoke(args: Record<string, unknown>) {
  const handler = toolRegistry.getHandler('qase_ci_report')!;
  return handler(args);
}

const passing = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ case_id: i + 1, status: 'passed' }));

/** Every result the tool actually sent, in the order it sent them. */
const recorded = () =>
  mockCreateResultBulk.mock.calls.flatMap((call) => call[2].results as { case_id: number }[]);

const batchSizes = () =>
  mockCreateResultBulk.mock.calls.map((call) => (call[2].results as unknown[]).length);

const summaryText = (result: any): string => result.content.map((b: any) => b.text).join('\n');

beforeEach(() => {
  mockCreateRun
    .mockReset()
    .mockImplementation(() => Promise.resolve({ data: { result: { id: 77 } } }));
  mockCreateResultBulk.mockReset().mockImplementation(() => Promise.resolve({ data: {} }));
  mockCompleteRun.mockReset().mockImplementation(() => Promise.resolve({ data: {} }));
});

describe('qase_ci_report — splitting a large batch', () => {
  it('sends 500 results as 200, 200 and 100', async () => {
    await invoke({ code: 'DEMO', title: 'CI #1', results: passing(500) });

    expect(batchSizes()).toEqual([200, 200, 100]);
  });

  it('records every result exactly once, in order', async () => {
    await invoke({ code: 'DEMO', title: 'CI #1', results: passing(500) });

    expect(recorded()).toHaveLength(500);
    expect(recorded().map((r) => r.case_id)).toEqual(passing(500).map((r) => r.case_id));
  });

  it('creates one run and completes it once, however many batches it takes', async () => {
    await invoke({ code: 'DEMO', title: 'CI #1', results: passing(500) });

    expect(mockCreateRun).toHaveBeenCalledTimes(1);
    expect(mockCompleteRun).toHaveBeenCalledTimes(1);
  });

  it('records every result into the run it just created', async () => {
    await invoke({ code: 'DEMO', title: 'CI #1', results: passing(500) });

    for (const call of mockCreateResultBulk.mock.calls) {
      expect(call[0]).toBe('DEMO');
      expect(call[1]).toBe(77);
    }
  });

  it('still sends a batch that fits as a single request', async () => {
    await invoke({ code: 'DEMO', title: 'CI #1', results: passing(200) });

    expect(batchSizes()).toEqual([200]);
  });

  it('reports the total recorded, not the size of the last batch', async () => {
    const result: any = await invoke({ code: 'DEMO', title: 'CI #1', results: passing(500) });

    expect(result.structuredContent.results_recorded).toBe(500);
  });

  it('says how many requests the split took', async () => {
    const result = await invoke({ code: 'DEMO', title: 'CI #1', results: passing(500) });

    expect(summaryText(result)).toMatch(/3 requests/);
  });
});

describe('qase_ci_report — a batch that fails half way', () => {
  beforeEach(() => {
    let calls = 0;
    mockCreateResultBulk.mockReset().mockImplementation(() => {
      calls += 1;
      if (calls === 2) {
        const error: any = new Error('Case not found');
        error.isAxiosError = true;
        error.response = { status: 404, data: { errorMessage: 'Case not found' } };
        return Promise.reject(error);
      }
      return Promise.resolve({ data: {} });
    });
  });

  it('names the run that exists and how many results reached it', async () => {
    const call = invoke({ code: 'DEMO', title: 'CI #1', results: passing(500) });

    await expect(call).rejects.toThrow(/run 77/i);
    await expect(call).rejects.toThrow(/200 of 500/);
  });

  it('stops at the failed batch instead of sending the rest', async () => {
    await expect(
      invoke({ code: 'DEMO', title: 'CI #1', results: passing(500) }),
    ).rejects.toThrow();

    expect(batchSizes()).toEqual([200, 200]);
  });

  it('does not complete a run whose results are incomplete', async () => {
    await expect(
      invoke({ code: 'DEMO', title: 'CI #1', results: passing(500) }),
    ).rejects.toThrow();

    expect(mockCompleteRun).not.toHaveBeenCalled();
  });
});

describe('qase_ci_report — bounding one tool call', () => {
  it('accepts 2000 results', async () => {
    await invoke({ code: 'DEMO', title: 'CI #1', results: passing(2000) });

    expect(recorded()).toHaveLength(2000);
  });

  it('refuses more than 2000 without creating a run', async () => {
    await expect(
      invoke({ code: 'DEMO', title: 'CI #1', results: passing(2001) }),
    ).rejects.toThrow(/2000/);

    expect(mockCreateRun).not.toHaveBeenCalled();
    expect(mockCreateResultBulk).not.toHaveBeenCalled();
  });
});

describe('qase_ci_report — defaults', () => {
  it('completes the run when `complete` is omitted, as the description promises', async () => {
    await invoke({ code: 'DEMO', title: 'CI #1', results: passing(2) });

    expect(mockCompleteRun).toHaveBeenCalledTimes(1);
  });

  it('leaves the run open when `complete` is false', async () => {
    await invoke({ code: 'DEMO', title: 'CI #1', results: passing(2), complete: false });

    expect(mockCompleteRun).not.toHaveBeenCalled();
  });

  it('marks the run as an autotest run when `is_autotest` is omitted', async () => {
    await invoke({ code: 'DEMO', title: 'CI #1', results: passing(2) });

    expect(mockCreateRun.mock.calls[0][1]).toMatchObject({ is_autotest: true });
  });
});
