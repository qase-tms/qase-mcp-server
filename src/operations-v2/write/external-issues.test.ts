/**
 * Tests for qase_external_issue_link — linking cases and runs to external
 * issue trackers (Jira Cloud / Jira Server).
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockCaseAttach = jest.fn();
const mockCaseDetach = jest.fn();
const mockRunUpdate = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    cases: {
      caseAttachExternalIssue: mockCaseAttach,
      caseDetachExternalIssue: mockCaseDetach,
    },
    runs: {
      runUpdateExternalIssue: mockRunUpdate,
    },
  }),
}));

import './external-issues.js';
import { toolRegistry } from '../../utils/registry.js';

const ok = () => Promise.resolve({ data: { status: true, result: {} } });

function invoke(args: Record<string, unknown>) {
  const handler = toolRegistry.getHandler('qase_external_issue_link')!;
  return handler(args);
}

describe('qase_external_issue_link — registration', () => {
  it('is registered as a discoverable tool', () => {
    expect(toolRegistry.hasTool('qase_external_issue_link')).toBe(true);
    expect(toolRegistry.getTools().map((t) => t.name)).not.toContain('qase_external_issue_link');
  });

  it('is findable by searching for "jira"', () => {
    const names = toolRegistry.searchTools('jira').map((t) => t.name);
    expect(names).toContain('qase_external_issue_link');
  });

  it('is findable by searching for "issue"', () => {
    const names = toolRegistry.searchTools('issue').map((t) => t.name);
    expect(names).toContain('qase_external_issue_link');
  });
});

describe('qase_external_issue_link — argument validation', () => {
  beforeEach(() => {
    mockCaseAttach.mockReset().mockImplementation(ok);
    mockCaseDetach.mockReset().mockImplementation(ok);
    mockRunUpdate.mockReset().mockImplementation(ok);
  });

  // The MCP server passes raw arguments straight to handlers, so the handler
  // validates them itself instead of crashing on a missing field.
  it('reports a missing `links` argument as a validation error', async () => {
    await expect(
      invoke({ code: 'DEMO', entity: 'case', action: 'attach', type: 'jira-cloud' }),
    ).rejects.toThrow(/links/i);

    expect(mockCaseAttach).not.toHaveBeenCalled();
  });

  it('reports an unknown entity as a validation error', async () => {
    await expect(
      invoke({
        code: 'DEMO',
        entity: 'defect',
        action: 'attach',
        type: 'jira-cloud',
        links: [{ id: 1, issues: ['PROJ-1'] }],
      }),
    ).rejects.toThrow(/entity/i);
  });

  it('reports an empty `links` array as a validation error', async () => {
    await expect(
      invoke({ code: 'DEMO', entity: 'case', action: 'attach', type: 'jira-cloud', links: [] }),
    ).rejects.toThrow(/links/i);

    expect(mockCaseAttach).not.toHaveBeenCalled();
  });
});

describe('qase_external_issue_link — cases', () => {
  beforeEach(() => {
    mockCaseAttach.mockReset().mockImplementation(ok);
    mockCaseDetach.mockReset().mockImplementation(ok);
    mockRunUpdate.mockReset().mockImplementation(ok);
  });

  it('attaches issues to a case via caseAttachExternalIssue', async () => {
    await invoke({
      code: 'DEMO',
      entity: 'case',
      action: 'attach',
      type: 'jira-cloud',
      links: [{ id: 1, issues: ['PROJ-1234'] }],
    });

    expect(mockCaseAttach).toHaveBeenCalledWith('DEMO', {
      type: 'jira-cloud',
      links: [{ case_id: 1, external_issues: ['PROJ-1234'] }],
    });
    expect(mockCaseDetach).not.toHaveBeenCalled();
  });

  it('detaches issues from a case via caseDetachExternalIssue', async () => {
    await invoke({
      code: 'DEMO',
      entity: 'case',
      action: 'detach',
      type: 'jira-server',
      links: [{ id: 7, issues: ['PROJ-1', 'PROJ-2'] }],
    });

    expect(mockCaseDetach).toHaveBeenCalledWith('DEMO', {
      type: 'jira-server',
      links: [{ case_id: 7, external_issues: ['PROJ-1', 'PROJ-2'] }],
    });
    expect(mockCaseAttach).not.toHaveBeenCalled();
  });

  it('sends every link in a single request', async () => {
    await invoke({
      code: 'DEMO',
      entity: 'case',
      action: 'attach',
      type: 'jira-cloud',
      links: [
        { id: 1, issues: ['PROJ-1'] },
        { id: 2, issues: ['PROJ-2'] },
      ],
    });

    expect(mockCaseAttach).toHaveBeenCalledTimes(1);
    expect(mockCaseAttach.mock.calls[0][1].links).toEqual([
      { case_id: 1, external_issues: ['PROJ-1'] },
      { case_id: 2, external_issues: ['PROJ-2'] },
    ]);
  });

  it('rejects a case link with no issues instead of calling the API', async () => {
    await expect(
      invoke({
        code: 'DEMO',
        entity: 'case',
        action: 'attach',
        type: 'jira-cloud',
        links: [{ id: 1 }],
      }),
    ).rejects.toThrow(/issues/i);

    expect(mockCaseAttach).not.toHaveBeenCalled();
  });

  it('reports the affected case count on success', async () => {
    const result = (await invoke({
      code: 'DEMO',
      entity: 'case',
      action: 'attach',
      type: 'jira-cloud',
      links: [
        { id: 1, issues: ['PROJ-1'] },
        { id: 2, issues: ['PROJ-2'] },
      ],
    })) as Record<string, unknown>;

    expect(result).toEqual({ success: true, entity: 'case', action: 'attach', linked: 2 });
  });

  it('surfaces API failures as tool errors', async () => {
    mockCaseAttach.mockImplementation(() => {
      const error: any = new Error('Issues with ids: PROJ-1 not found.');
      error.isAxiosError = true;
      error.response = {
        status: 400,
        data: { errorMessage: 'Issues with ids: PROJ-1 not found.' },
      };
      return Promise.reject(error);
    });

    await expect(
      invoke({
        code: 'DEMO',
        entity: 'case',
        action: 'attach',
        type: 'jira-cloud',
        links: [{ id: 1, issues: ['PROJ-1'] }],
      }),
    ).rejects.toThrow(/PROJ-1 not found/);
  });
});

describe('qase_external_issue_link — runs', () => {
  beforeEach(() => {
    mockCaseAttach.mockReset().mockImplementation(ok);
    mockCaseDetach.mockReset().mockImplementation(ok);
    mockRunUpdate.mockReset().mockImplementation(ok);
  });

  it('attaches an issue to a run via runUpdateExternalIssue', async () => {
    await invoke({
      code: 'DEMO',
      entity: 'run',
      action: 'attach',
      type: 'jira-cloud',
      links: [{ id: 400, issues: ['PROJ-1234'] }],
    });

    expect(mockRunUpdate).toHaveBeenCalledWith('DEMO', {
      type: 'jira-cloud',
      links: [{ run_id: 400, external_issue: 'PROJ-1234' }],
    });
  });

  it('detaches a run link by sending external_issue: null', async () => {
    await invoke({
      code: 'DEMO',
      entity: 'run',
      action: 'detach',
      type: 'jira-cloud',
      links: [{ id: 400 }],
    });

    expect(mockRunUpdate).toHaveBeenCalledWith('DEMO', {
      type: 'jira-cloud',
      links: [{ run_id: 400, external_issue: null }],
    });
  });

  it('rejects attaching more than one issue to a run', async () => {
    await expect(
      invoke({
        code: 'DEMO',
        entity: 'run',
        action: 'attach',
        type: 'jira-cloud',
        links: [{ id: 400, issues: ['PROJ-1', 'PROJ-2'] }],
      }),
    ).rejects.toThrow(/only one/i);

    expect(mockRunUpdate).not.toHaveBeenCalled();
  });

  it('rejects attaching to a run without an issue', async () => {
    await expect(
      invoke({
        code: 'DEMO',
        entity: 'run',
        action: 'attach',
        type: 'jira-cloud',
        links: [{ id: 400 }],
      }),
    ).rejects.toThrow(/issues/i);

    expect(mockRunUpdate).not.toHaveBeenCalled();
  });
});
