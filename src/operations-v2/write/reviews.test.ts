/**
 * Tests for the test case review tools.
 *
 * The review API covers authoring only — approve/request-changes/merge/decline
 * have no endpoints — so a large part of what these assert is that the tools do
 * not imply otherwise, and that the API's sharp edges are surfaced: changing a
 * proposal resets approvals, reviewers are author UUIDs rather than user IDs,
 * and every call fails if review is disabled for the project.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockCreateReview = jest.fn();
const mockUpdateReview = jest.fn();
const mockGetReviews = jest.fn();
const mockDeleteReview = jest.fn();
const mockBulkCreate = jest.fn();
const mockGetAuthors = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    reviews: {
      createReview: mockCreateReview,
      updateReview: mockUpdateReview,
      getReviews: mockGetReviews,
      deleteReview: mockDeleteReview,
      bulkCreateReviews: mockBulkCreate,
    },
    authors: { getAuthors: mockGetAuthors },
  }),
}));

// Enum normalisation hits the system-fields endpoint; keep it out of these tests.
jest.mock('../../utils/case-enums.js', () => ({
  normalizeCaseEnums: async (data: Record<string, unknown>) => data,
}));

import './reviews.js';
import { toolRegistry } from '../../utils/registry.js';

function invoke(tool: string, args: Record<string, unknown>) {
  return toolRegistry.getHandler(tool)!(args);
}

/** The ReviewCreate/ReviewUpdate body sent to the API. */
function sentPayload(mock: jest.Mock, argIndex = 1): any {
  return mock.mock.calls[0][argIndex];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateReview.mockReturnValue(Promise.resolve({ data: { status: true, result: { id: 7 } } }));
  mockUpdateReview.mockReturnValue(Promise.resolve({ data: { status: true, result: { id: 7 } } }));
  mockDeleteReview.mockReturnValue(Promise.resolve({ data: { status: true, result: { id: 7 } } }));
  mockBulkCreate.mockReturnValue(
    Promise.resolve({ data: { status: true, result: { items: [{ id: 7 }] } } }),
  );
  mockGetReviews.mockReturnValue(
    Promise.resolve({ data: { status: true, result: { total: 0, entities: [] } } }),
  );
});

describe('review tools — registration', () => {
  const tools = [
    'qase_review_create',
    'qase_review_update',
    'qase_review_list',
    'qase_review_delete',
    'qase_review_bulk_create',
  ];

  it('registers all five as discoverable', () => {
    const core = toolRegistry.getTools().map((t) => t.name);
    for (const name of tools) {
      expect(toolRegistry.hasTool(name)).toBe(true);
      expect(core).not.toContain(name);
    }
  });

  it('is findable by searching for "review"', () => {
    const names = toolRegistry.searchTools('review').map((t) => t.name);
    for (const name of tools) {
      expect(names).toContain(name);
    }
  });

  it('states that merging and approving are not possible through the API', () => {
    // The tool must not imply workflow actions it cannot perform.
    for (const name of ['qase_review_create', 'qase_review_update', 'qase_review_bulk_create']) {
      const description = toolRegistry.getTool(name)!.description!;
      expect(description).toMatch(/no endpoints for approving/);
    }
  });

  it('warns about the approval reset on the update tool', () => {
    const description = toolRegistry.getTool('qase_review_update')!.description!;
    expect(description).toMatch(/RESETS every approval/);
  });
});

describe('qase_review_create — create vs edit review', () => {
  it('omits case_id for a new-case draft and reports type "create"', async () => {
    const result = await invoke('qase_review_create', {
      code: 'DEMO',
      title: 'New login case',
    });

    expect(sentPayload(mockCreateReview)).not.toHaveProperty('case_id');
    expect(sentPayload(mockCreateReview).proposed_case.title).toBe('New login case');
    expect(result).toMatchObject({ review_id: 7, type: 'create', case_id: null });
  });

  it('sends case_id for a proposal against an existing case and reports type "edit"', async () => {
    const result = await invoke('qase_review_create', {
      code: 'DEMO',
      case_id: 42,
      description: 'clearer wording',
    });

    expect(sentPayload(mockCreateReview).case_id).toBe(42);
    expect(result).toMatchObject({ type: 'edit', case_id: 42 });
  });

  it('requires a title for a create review, before calling the API', async () => {
    await expect(invoke('qase_review_create', { code: 'DEMO' })).rejects.toThrow(/needs a title/);
    expect(mockCreateReview).not.toHaveBeenCalled();
  });

  it('does not require a title when proposing changes to an existing case', async () => {
    await invoke('qase_review_create', { code: 'DEMO', case_id: 42, preconditions: 'logged in' });
    expect(mockCreateReview).toHaveBeenCalled();
  });
});

describe('qase_review_create — proposed case payload', () => {
  it('maps automation to is_manual / is_to_be_automated in snake_case', async () => {
    // ReviewCaseData has no `automation` field, and the case-side helper emits
    // camelCase isManual/isToBeAutomated — reusing it would drop the value.
    await invoke('qase_review_create', { code: 'DEMO', title: 'x', automation: 2 });

    const proposed = sentPayload(mockCreateReview).proposed_case;
    expect(proposed).not.toHaveProperty('automation');
    expect(proposed).not.toHaveProperty('isManual');
    expect(proposed.is_manual).toBe(false);
    expect(proposed.is_to_be_automated).toBe(false);
  });

  it('marks a to-be-automated proposal on both flags', async () => {
    await invoke('qase_review_create', { code: 'DEMO', title: 'x', automation: 1 });

    const proposed = sentPayload(mockCreateReview).proposed_case;
    expect(proposed.is_manual).toBe(true);
    expect(proposed.is_to_be_automated).toBe(true);
  });

  it('leaves the payload alone when automation was not given', async () => {
    await invoke('qase_review_create', { code: 'DEMO', title: 'x' });

    const proposed = sentPayload(mockCreateReview).proposed_case;
    expect(proposed).not.toHaveProperty('is_manual');
    expect(proposed).not.toHaveProperty('automation');
  });

  it('carries steps through, including shared step references', async () => {
    await invoke('qase_review_create', {
      code: 'DEMO',
      title: 'x',
      steps: [{ action: 'open page' }, { shared: 'abc123' }],
    });

    const steps = sentPayload(mockCreateReview).proposed_case.steps;
    expect(steps).toHaveLength(2);
    expect(steps[1]).toHaveProperty('shared', 'abc123');
  });
});

describe('review tools — reviewers', () => {
  it('passes author UUIDs through untouched', async () => {
    const uuid = 'f81d4fae-7dec-11d0-a765-00a0c91e6bf6';
    await invoke('qase_review_create', { code: 'DEMO', title: 'x', reviewers: [uuid] });

    expect(sentPayload(mockCreateReview).reviewers).toEqual([uuid]);
    expect(mockGetAuthors).not.toHaveBeenCalled();
  });

  it('resolves an email to its author UUID', async () => {
    mockGetAuthors.mockReturnValue(
      Promise.resolve({
        data: {
          status: true,
          result: { entities: [{ email: 'qa@example.com', uuid: 'uuid-1' }] },
        },
      }),
    );

    await invoke('qase_review_create', {
      code: 'DEMO',
      title: 'x',
      reviewers: ['qa@example.com'],
    });

    expect(sentPayload(mockCreateReview).reviewers).toEqual(['uuid-1']);
  });

  it('fails with a usable message when the email matches no author', async () => {
    mockGetAuthors.mockReturnValue(
      Promise.resolve({ data: { status: true, result: { entities: [] } } }),
    );

    await expect(
      invoke('qase_review_create', { code: 'DEMO', title: 'x', reviewers: ['ghost@example.com'] }),
    ).rejects.toThrow(/No author found for "ghost@example.com"/);

    expect(mockCreateReview).not.toHaveBeenCalled();
  });
});

describe('qase_review_update', () => {
  it('sends only reviewers when only reviewers changed, and reports no approval reset', async () => {
    const result = await invoke('qase_review_update', {
      code: 'DEMO',
      id: 7,
      reviewers: ['uuid-1'],
    });

    const payload = sentPayload(mockUpdateReview, 2);
    expect(payload).not.toHaveProperty('proposed_case');
    expect(result).toMatchObject({ approvals_reset: false });
  });

  it('flags the approval reset when the proposal changes', async () => {
    const result = await invoke('qase_review_update', {
      code: 'DEMO',
      id: 7,
      title: 'reworded',
    });

    expect(sentPayload(mockUpdateReview, 2).proposed_case.title).toBe('reworded');
    // Easy to trigger accidentally, so the result says it happened.
    expect(result).toMatchObject({ approvals_reset: true });
  });

  it('refuses a no-op update instead of calling the API', async () => {
    await expect(invoke('qase_review_update', { code: 'DEMO', id: 7 })).rejects.toThrow(
      /Nothing to update/,
    );
    expect(mockUpdateReview).not.toHaveBeenCalled();
  });
});

describe('qase_review_list', () => {
  it('passes filters through in the order the client expects', async () => {
    await invoke('qase_review_list', {
      code: 'DEMO',
      status: 'open',
      type: 'edit',
      case_id: 42,
      author_uuid: 'a-1',
      reviewer_uuid: 'r-1',
      search: 'login',
      limit: 10,
      offset: 20,
    });

    expect(mockGetReviews).toHaveBeenCalledWith(
      'DEMO',
      'open',
      'edit',
      42,
      'a-1',
      'r-1',
      'login',
      10,
      20,
    );
  });

  it('reports the total alongside what was returned', async () => {
    mockGetReviews.mockReturnValue(
      Promise.resolve({
        data: {
          status: true,
          result: {
            total: 130,
            entities: [{ id: 1, title: 'a', type: 'edit', status: 'open', case_id: 42 }],
          },
        },
      }),
    );

    const result: any = await invoke('qase_review_list', { code: 'DEMO' });
    const text = result.content.map((b: any) => b.text).join('\n');

    expect(result.structuredContent).toMatchObject({ total: 130, returned: 1 });
    expect(text).toContain('130');
    expect(text).toMatch(/Showing 1 of 130/);
  });
});

describe('qase_review_delete', () => {
  it('deletes by id', async () => {
    const result = await invoke('qase_review_delete', { code: 'DEMO', id: 7 });

    expect(mockDeleteReview).toHaveBeenCalledWith('DEMO', 7);
    expect(result).toEqual({ success: true, review_id: 7 });
  });

  it('says that declining is not the same thing', () => {
    const description = toolRegistry.getTool('qase_review_delete')!.description!;
    expect(description).toMatch(/does not decline it/);
  });
});

describe('qase_review_bulk_create', () => {
  it('builds one proposal per item', async () => {
    await invoke('qase_review_bulk_create', {
      code: 'DEMO',
      reviews: [{ title: 'first' }, { case_id: 42, description: 'tweak' }],
    });

    const body = sentPayload(mockBulkCreate);
    expect(body.reviews).toHaveLength(2);
    expect(body.reviews[0].proposed_case.title).toBe('first');
    expect(body.reviews[1].case_id).toBe(42);
  });

  it('rejects the batch locally when an item lacks a title, sending nothing', async () => {
    // The API validates the batch as a whole, so one bad item would reject all.
    await expect(
      invoke('qase_review_bulk_create', {
        code: 'DEMO',
        reviews: [{ title: 'fine' }, { description: 'no title, no case_id' }],
      }),
    ).rejects.toThrow(/needs a title/);

    expect(mockBulkCreate).not.toHaveBeenCalled();
  });
});

describe('review tools — feature disabled for the project', () => {
  it('points at the project setting when the API rejects the request', async () => {
    mockCreateReview.mockReturnValue(
      Promise.reject(
        Object.assign(new Error('Bad request'), {
          isAxiosError: true,
          response: { status: 400, data: { errorMessage: 'Test case review is disabled' } },
        }),
      ),
    );

    await expect(invoke('qase_review_create', { code: 'DEMO', title: 'x' })).rejects.toThrow(
      /Test case review/,
    );
  });
});
