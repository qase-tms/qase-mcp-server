/**
 * Tests for qase_case_bulk_create — creating many test cases in one request.
 */

import { describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockBulk = jest.fn();
const mockCreateCase = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    cases: { bulk: mockBulk, createCase: mockCreateCase },
  }),
}));

import './cases-bulk.js';
import { toolRegistry } from '../../utils/registry.js';
import { __setCaseEnumCacheForTest } from '../../utils/case-enums.js';

const ok = (ids: number[]) => () => Promise.resolve({ data: { status: true, result: { ids } } });

function invoke(args: Record<string, unknown>) {
  const handler = toolRegistry.getHandler('qase_case_bulk_create')!;
  return handler(args);
}

const sentCases = () => mockBulk.mock.calls[0][1].cases as Record<string, unknown>[];

beforeAll(async () => {
  // Real enum normalisation runs against this snapshot instead of the API.
  await __setCaseEnumCacheForTest({
    priority: { high: 1, medium: 2, low: 3 },
    severity: { blocker: 1, minor: 5 },
    automation: { 'is-not-automated': 0, 'to-be-automated': 1, automated: 2 },
  });
});

beforeEach(() => {
  mockBulk.mockReset().mockImplementation(ok([1, 2]));
  mockCreateCase.mockReset();
});

describe('qase_case_bulk_create — registration', () => {
  it('is registered as a discoverable tool', () => {
    expect(toolRegistry.hasTool('qase_case_bulk_create')).toBe(true);
    expect(toolRegistry.getTools().map((t) => t.name)).not.toContain('qase_case_bulk_create');
  });

  it('is findable by searching for "bulk"', () => {
    expect(toolRegistry.searchTools('bulk').map((t) => t.name)).toContain('qase_case_bulk_create');
  });
});

describe('qase_case_bulk_create — request shape', () => {
  it('sends every case in a single bulk request', async () => {
    await invoke({
      code: 'DEMO',
      cases: [{ title: 'Login' }, { title: 'Logout' }, { title: 'Reset password' }],
    });

    expect(mockBulk).toHaveBeenCalledTimes(1);
    expect(mockBulk.mock.calls[0][0]).toBe('DEMO');
    expect(sentCases().map((c) => c.title)).toEqual(['Login', 'Logout', 'Reset password']);
  });

  it('never falls back to per-case creation', async () => {
    await invoke({ code: 'DEMO', cases: [{ title: 'A' }, { title: 'B' }] });
    expect(mockCreateCase).not.toHaveBeenCalled();
  });

  it('returns the created count and ids', async () => {
    mockBulk.mockImplementation(ok([220, 221, 222]));

    const result = await invoke({
      code: 'DEMO',
      cases: [{ title: 'A' }, { title: 'B' }, { title: 'C' }],
    });

    expect(result).toEqual({ created: 3, ids: [220, 221, 222] });
  });

  it('keeps case fields such as suite_id and steps intact', async () => {
    await invoke({
      code: 'DEMO',
      cases: [
        {
          title: 'With steps',
          suite_id: 3,
          steps: [{ action: 'open page', expected_result: 'page opens' }],
        },
      ],
    });

    expect(sentCases()[0]).toMatchObject({
      title: 'With steps',
      suite_id: 3,
      steps: [{ action: 'open page', expected_result: 'page opens' }],
    });
  });
});

describe('qase_case_bulk_create — enum normalisation', () => {
  it('resolves string labels to numeric IDs for every case', async () => {
    await invoke({
      code: 'DEMO',
      cases: [
        { title: 'A', priority: 'high', severity: 'blocker' },
        { title: 'B', priority: 'low', severity: 'minor' },
      ],
    });

    expect(sentCases()[0]).toMatchObject({ priority: 1, severity: 1 });
    expect(sentCases()[1]).toMatchObject({ priority: 3, severity: 5 });
  });

  it('maps the automation label onto isManual/isToBeAutomated', async () => {
    await invoke({
      code: 'DEMO',
      cases: [
        { title: 'A', automation: 'automated' },
        { title: 'B', automation: 'to-be-automated' },
      ],
    });

    expect(sentCases()[0]).toMatchObject({ isManual: 0 });
    expect(sentCases()[0].automation).toBeUndefined();
    expect(sentCases()[1]).toMatchObject({ isManual: 1, isToBeAutomated: 1 });
  });

  it('accepts numeric IDs as-is', async () => {
    await invoke({ code: 'DEMO', cases: [{ title: 'A', priority: '2' }] });
    expect(sentCases()[0]).toMatchObject({ priority: 2 });
  });
});

describe('qase_case_bulk_create — validation', () => {
  it('rejects a missing `cases` argument', async () => {
    await expect(invoke({ code: 'DEMO' })).rejects.toThrow(/cases/i);
    expect(mockBulk).not.toHaveBeenCalled();
  });

  it('rejects an empty `cases` array', async () => {
    await expect(invoke({ code: 'DEMO', cases: [] })).rejects.toThrow(/cases/i);
    expect(mockBulk).not.toHaveBeenCalled();
  });

  it('rejects a case without a title', async () => {
    await expect(
      invoke({ code: 'DEMO', cases: [{ title: 'A' }, { priority: 'high' }] }),
    ).rejects.toThrow(/title/i);
    expect(mockBulk).not.toHaveBeenCalled();
  });

  it('accepts exactly 100 cases', async () => {
    const cases = Array.from({ length: 100 }, (_, i) => ({ title: `Case ${i + 1}` }));
    await invoke({ code: 'DEMO', cases });
    expect(sentCases()).toHaveLength(100);
  });

  it('rejects more than 100 cases without calling the API', async () => {
    const cases = Array.from({ length: 101 }, (_, i) => ({ title: `Case ${i + 1}` }));

    await expect(invoke({ code: 'DEMO', cases })).rejects.toThrow(/100/);
    expect(mockBulk).not.toHaveBeenCalled();
  });
});

describe('qase_case_bulk_create — errors', () => {
  it('surfaces API failures as tool errors', async () => {
    mockBulk.mockImplementation(() => {
      const error: any = new Error('Suite not found');
      error.isAxiosError = true;
      error.response = { status: 404, data: { errorMessage: 'Suite not found' } };
      return Promise.reject(error);
    });

    await expect(invoke({ code: 'DEMO', cases: [{ title: 'A', suite_id: 999 }] })).rejects.toThrow(
      /Suite not found/,
    );
  });
});
