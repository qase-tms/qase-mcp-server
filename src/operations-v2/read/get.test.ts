/**
 * Tests for qase_get — entity fetching with `include` support.
 *
 * Linked external issues are only returned by the Qase API when the request
 * asks for them via `include`, so qase_get requests them by default for cases
 * and runs.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockGetCase = jest.fn();
const mockGetRun = jest.fn();
const mockGetSuite = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    cases: { getCase: mockGetCase },
    runs: { getRun: mockGetRun },
    suites: { getSuite: mockGetSuite },
  }),
}));

import './get.js';
import { toolRegistry } from '../../utils/registry.js';

const ok = (result: unknown) => () => Promise.resolve({ data: { status: true, result } });

function invoke(args: Record<string, unknown>) {
  const handler = toolRegistry.getHandler('qase_get')!;
  return handler(args);
}

beforeEach(() => {
  mockGetCase.mockReset().mockImplementation(ok({ id: 1, external_issues: [] }));
  mockGetRun.mockReset().mockImplementation(ok({ id: 400, external_issue: null }));
  mockGetSuite.mockReset().mockImplementation(ok({ id: 5 }));
});

describe('qase_get — include parameter', () => {
  it('exposes an `include` field in its schema', () => {
    const tool = toolRegistry.getAllTools().find((t) => t.name === 'qase_get');
    const props = (tool?.inputSchema as any)?.properties ?? {};
    expect(props.include).toBeDefined();
  });

  it('requests external_issues for a case by default', async () => {
    await invoke({ entity: 'case', code: 'DEMO', id: 1 });
    expect(mockGetCase).toHaveBeenCalledWith('DEMO', 1, 'external_issues');
  });

  it('requests external_issue for a run by default', async () => {
    await invoke({ entity: 'run', code: 'DEMO', id: 400 });
    expect(mockGetRun).toHaveBeenCalledWith('DEMO', 400, 'external_issue');
  });

  it('returns the external issues in the result', async () => {
    mockGetCase.mockImplementation(ok({ id: 1, external_issues: [{ type: 'jira-cloud' }] }));
    const result = (await invoke({ entity: 'case', code: 'DEMO', id: 1 })) as any;
    expect(result.external_issues).toEqual([{ type: 'jira-cloud' }]);
  });

  it('uses an explicit include over the default', async () => {
    await invoke({ entity: 'case', code: 'DEMO', id: 1, include: 'external_issues,something' });
    expect(mockGetCase).toHaveBeenCalledWith('DEMO', 1, 'external_issues,something');
  });

  it('does not send include for entities that do not support it', async () => {
    await invoke({ entity: 'suite', code: 'DEMO', id: 5 });
    expect(mockGetSuite).toHaveBeenCalledWith('DEMO', 5);
  });
});

describe('qase_get — include fallback', () => {
  it('retries without include when the default include is rejected', async () => {
    mockGetCase.mockImplementation((_code: string, _id: number, include?: string) => {
      if (include) {
        const error: any = new Error('Invalid include value');
        error.isAxiosError = true;
        error.response = { status: 400, data: { errorMessage: 'Invalid include value' } };
        return Promise.reject(error);
      }
      return Promise.resolve({ data: { status: true, result: { id: 1 } } });
    });

    const result = (await invoke({ entity: 'case', code: 'DEMO', id: 1 })) as any;

    expect(result).toEqual({ id: 1 });
    expect(mockGetCase).toHaveBeenNthCalledWith(1, 'DEMO', 1, 'external_issues');
    expect(mockGetCase).toHaveBeenNthCalledWith(2, 'DEMO', 1, undefined);
  });

  it('does not retry when the caller asked for include explicitly', async () => {
    mockGetCase.mockImplementation(() => {
      const error: any = new Error('Invalid include value');
      error.isAxiosError = true;
      error.response = { status: 400, data: { errorMessage: 'Invalid include value' } };
      return Promise.reject(error);
    });

    await expect(
      invoke({ entity: 'case', code: 'DEMO', id: 1, include: 'external_issues' }),
    ).rejects.toThrow(/Invalid include value/);

    expect(mockGetCase).toHaveBeenCalledTimes(1);
  });

  it('reports the original error when the case does not exist', async () => {
    mockGetCase.mockImplementation(() => {
      const error: any = new Error('Case not found');
      error.isAxiosError = true;
      error.response = { status: 404, data: { errorMessage: 'Case not found' } };
      return Promise.reject(error);
    });

    await expect(invoke({ entity: 'case', code: 'DEMO', id: 999 })).rejects.toThrow(
      /Case not found/,
    );
  });
});
