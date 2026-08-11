/**
 * Tests for qase_case_upsert — focused on referencing shared steps from a case.
 *
 * The API links a step to a shared step through the `shared` property holding
 * the shared step hash; on read the same link comes back as
 * `shared_step_hash`, which is what callers tend to try first.
 */

import { describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockCreateCase = jest.fn();
const mockUpdateCase = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    cases: { createCase: mockCreateCase, updateCase: mockUpdateCase },
  }),
}));

import './cases.js';
import { toolRegistry } from '../../utils/registry.js';
import { __setCaseEnumCacheForTest } from '../../utils/case-enums.js';

const HASH = '9f8f0ce2660523589bfd34889c47e0647a1460c0';

function invoke(args: Record<string, unknown>) {
  const handler = toolRegistry.getHandler('qase_case_upsert')!;
  return handler(args);
}

/** Steps as they were sent to the API on the last create call. */
const sentSteps = () => mockCreateCase.mock.calls[0][1].steps as Record<string, unknown>[];

beforeAll(async () => {
  await __setCaseEnumCacheForTest({ priority: { high: 1 } });
});

beforeEach(() => {
  mockCreateCase
    .mockReset()
    .mockImplementation(() => Promise.resolve({ data: { status: true, result: { id: 1 } } }));
  mockUpdateCase
    .mockReset()
    .mockImplementation(() => Promise.resolve({ data: { status: true, result: { id: 1 } } }));
});

describe('qase_case_upsert — shared step references', () => {
  it('passes `shared` through on a top-level step', async () => {
    await invoke({ code: 'DEMO', title: 'Case', steps: [{ shared: HASH }] });
    expect(sentSteps()[0]).toEqual({ shared: HASH });
  });

  it('accepts a step that has only `shared`, without action text', async () => {
    await invoke({ code: 'DEMO', title: 'Case', steps: [{ shared: HASH }] });
    expect(mockCreateCase).toHaveBeenCalled();
  });

  it('passes `shared` through on a nested step', async () => {
    await invoke({
      code: 'DEMO',
      title: 'Case',
      steps: [{ action: 'parent', steps: [{ shared: HASH }] }],
    });

    expect(sentSteps()[0]).toMatchObject({
      action: 'parent',
      steps: [{ shared: HASH }],
    });
  });

  it('mixes shared and inline steps in order', async () => {
    await invoke({
      code: 'DEMO',
      title: 'Case',
      steps: [{ shared: HASH }, { action: 'Regular step' }],
    });

    expect(sentSteps()).toEqual([{ shared: HASH }, { action: 'Regular step' }]);
  });
});

describe('qase_case_upsert — shared_step_hash alias', () => {
  // The read side of the API reports the link as `shared_step_hash`, so callers
  // reach for that name on write. The API only accepts `shared`.
  it('translates `shared_step_hash` into `shared`', async () => {
    await invoke({ code: 'DEMO', title: 'Case', steps: [{ shared_step_hash: HASH }] });

    expect(sentSteps()[0]).toEqual({ shared: HASH });
  });

  it('translates the alias on nested steps too', async () => {
    await invoke({
      code: 'DEMO',
      title: 'Case',
      steps: [{ action: 'parent', steps: [{ shared_step_hash: HASH }] }],
    });

    expect(sentSteps()[0]).toMatchObject({ steps: [{ shared: HASH }] });
  });

  it('never sends shared_step_hash to the API', async () => {
    await invoke({ code: 'DEMO', title: 'Case', steps: [{ shared_step_hash: HASH }] });

    expect(JSON.stringify(sentSteps())).not.toContain('shared_step_hash');
  });

  it('prefers `shared` when both names are given', async () => {
    await invoke({
      code: 'DEMO',
      title: 'Case',
      steps: [{ shared: HASH, shared_step_hash: 'other-hash' }],
    });

    expect(sentSteps()[0]).toEqual({ shared: HASH });
  });
});

describe('qase_case_upsert — regressions', () => {
  it('leaves ordinary steps untouched', async () => {
    await invoke({
      code: 'DEMO',
      title: 'Case',
      steps: [{ action: 'open page', expected_result: 'page opens', data: 'none' }],
    });

    expect(sentSteps()[0]).toEqual({
      action: 'open page',
      expected_result: 'page opens',
      data: 'none',
    });
  });

  it('still normalises enum labels', async () => {
    await invoke({ code: 'DEMO', title: 'Case', priority: 'high' });
    expect(mockCreateCase.mock.calls[0][1]).toMatchObject({ priority: 1 });
  });

  it('updates an existing case when id is given', async () => {
    await invoke({ code: 'DEMO', id: 7, title: 'Case', steps: [{ shared: HASH }] });

    expect(mockUpdateCase).toHaveBeenCalled();
    expect(mockUpdateCase.mock.calls[0][2].steps).toEqual([{ shared: HASH }]);
    expect(mockCreateCase).not.toHaveBeenCalled();
  });
});
