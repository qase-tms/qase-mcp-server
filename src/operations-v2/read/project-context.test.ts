/**
 * Tests for qase_project_context — coverage reporting and full pagination.
 *
 * The tool fetches the first 100 entities of each collection by default. A
 * project larger than that used to be truncated silently, leaving the consumer
 * unable to tell a partial list from a complete one.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockGetProject = jest.fn();
const mockGetSuites = jest.fn();
const mockGetMilestones = jest.fn();
const mockGetEnvironments = jest.fn();
const mockGetCustomFields = jest.fn();
const mockGetUsers = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    projects: { getProject: mockGetProject },
    suites: { getSuites: mockGetSuites },
    milestones: { getMilestones: mockGetMilestones },
    environment: { getEnvironments: mockGetEnvironments },
    customFields: { getCustomFields: mockGetCustomFields },
    users: { getUsers: mockGetUsers },
  }),
}));

// In-memory cache stub — the real one would serve a stale entry across tests.
const cacheStore = new Map<string, unknown>();
jest.mock('../../cache/index.js', () => ({
  getCache: async () => ({
    get: async (k: string) => cacheStore.get(k),
    set: async (k: string, v: unknown) => {
      cacheStore.set(k, v);
    },
  }),
  buildCacheKey: (parts: Record<string, string>) => JSON.stringify(parts),
  hashToken: () => 'test-tenant',
}));

import './project-context.js';
import { toolRegistry } from '../../utils/registry.js';

/** A list response holding `count` synthetic entities out of `total`. */
function listPage(total: number, count: number, offset = 0) {
  const entities = Array.from({ length: count }, (_, i) => ({
    id: offset + i + 1,
    title: `Entity ${offset + i + 1}`,
  }));
  return Promise.resolve({ data: { status: true, result: { total, entities } } });
}

/** An endpoint serving `total` entities across pages of 100. */
function paged(total: number) {
  return (...args: unknown[]) => {
    // Suites/milestones: (code, search, limit, offset). Users: (limit, offset).
    const nums = args.filter((a): a is number => typeof a === 'number');
    const [limit, offset] = [nums[0] ?? 100, nums[1] ?? 0];
    return listPage(total, Math.max(0, Math.min(limit, total - offset)), offset);
  };
}

function invoke(args: Record<string, unknown>) {
  const handler = toolRegistry.getHandler('qase_project_context')!;
  return handler(args);
}

/** The structured payload richResult carries alongside the summary blocks. */
function structured(result: any) {
  return result.structuredContent ?? result;
}

function summaryText(result: any): string {
  return result.content.map((b: any) => b.text).join('\n');
}

beforeEach(() => {
  jest.clearAllMocks();
  cacheStore.clear();

  mockGetProject.mockReturnValue(
    Promise.resolve({ data: { status: true, result: { title: 'Dev Experience' } } }),
  );
  // Small collections that fit in a single page.
  mockGetSuites.mockImplementation(paged(3));
  mockGetMilestones.mockImplementation(paged(2));
  mockGetEnvironments.mockImplementation(paged(1));
  mockGetCustomFields.mockImplementation(paged(0));
  mockGetUsers.mockImplementation(paged(4));
});

describe('qase_project_context — coverage reporting', () => {
  it('reports every collection as complete when it fits in one page', async () => {
    const result = structured(await invoke({ code: 'DEMO' }));

    expect(result.coverage.suites).toEqual({ total: 3, loaded: 3, truncated: false });
    expect(result.coverage.users).toEqual({ total: 4, loaded: 4, truncated: false });
    expect(
      Object.values(result.coverage).every((c: any) => c.truncated === false),
    ).toBe(true);
  });

  it('flags truncation instead of silently dropping entities', async () => {
    mockGetSuites.mockImplementation(paged(2711));

    const result = await invoke({ code: 'DEVX' });

    expect(structured(result).coverage.suites).toEqual({
      total: 2711,
      loaded: 100,
      truncated: true,
    });
  });

  it('states the truncation in the human-readable summary', async () => {
    mockGetSuites.mockImplementation(paged(2711));

    const summary = summaryText(await invoke({ code: 'DEVX' }));

    // The real total must be visible, not just the 100 that were loaded.
    expect(summary).toContain('100 of 2711');
    expect(summary).toContain('truncated');
    expect(summary).toContain('full: true');
  });

  it('does not describe loaded suites as the project total when truncated', async () => {
    mockGetSuites.mockImplementation(paged(2711));

    const summary = summaryText(await invoke({ code: 'DEVX' }));

    // Regression guard: the header used to read "N of 100 total", presenting a
    // 3.7% slice as the whole project.
    expect(summary).not.toContain('of 100 total');
    expect(summary).toContain('2711 in project');
  });

  it('falls back to the loaded count when the API omits total', async () => {
    mockGetSuites.mockReturnValue(
      Promise.resolve({ data: { status: true, result: { entities: [{ id: 1 }] } } }),
    );

    const result = structured(await invoke({ code: 'DEMO' }));

    expect(result.coverage.suites).toEqual({ total: 1, loaded: 1, truncated: false });
  });

  it('reports a failed collection as empty without failing the whole call', async () => {
    mockGetSuites.mockReturnValue(Promise.reject(new Error('boom')));

    const result = structured(await invoke({ code: 'DEMO' }));

    expect(result.coverage.suites).toEqual({ total: 0, loaded: 0, truncated: false });
    // The rest of the context still arrives.
    expect(result.coverage.users.loaded).toBe(4);
  });
});

describe('qase_project_context — full pagination', () => {
  it('fetches one page per collection by default', async () => {
    mockGetSuites.mockImplementation(paged(2711));

    await invoke({ code: 'DEVX' });

    expect(mockGetSuites).toHaveBeenCalledTimes(1);
    expect(mockGetSuites).toHaveBeenCalledWith('DEVX', undefined, 100, 0);
  });

  it('pages through everything when full is set', async () => {
    mockGetSuites.mockImplementation(paged(250));

    const result = structured(await invoke({ code: 'DEVX', full: true }));

    expect(mockGetSuites).toHaveBeenCalledTimes(3); // 100 + 100 + 50
    expect(result.coverage.suites).toEqual({ total: 250, loaded: 250, truncated: false });
    expect(result.suites.entities).toHaveLength(250);
  });

  it('advances the offset on each page', async () => {
    mockGetSuites.mockImplementation(paged(250));

    await invoke({ code: 'DEVX', full: true });

    const offsets = mockGetSuites.mock.calls.map((c) => c[3]);
    expect(offsets).toEqual([0, 100, 200]);
  });

  it('stops instead of looping when a page comes back empty', async () => {
    // Claims 5000 entities but serves nothing after the first page.
    mockGetSuites.mockImplementation((...args: unknown[]) => {
      const offset = args[3] as number;
      return offset === 0 ? listPage(5000, 100) : listPage(5000, 0, offset);
    });

    const result = structured(await invoke({ code: 'DEVX', full: true }));

    expect(mockGetSuites).toHaveBeenCalledTimes(2);
    // The unmet total stays visible rather than being reported as complete.
    expect(result.coverage.suites).toEqual({ total: 5000, loaded: 100, truncated: true });
  });

  it('caches full and partial responses separately', async () => {
    mockGetSuites.mockImplementation(paged(250));

    const partial = structured(await invoke({ code: 'DEVX' }));
    expect(partial.coverage.suites.loaded).toBe(100);

    // Must not be served the cached partial entry.
    const complete = structured(await invoke({ code: 'DEVX', full: true }));
    expect(complete.coverage.suites.loaded).toBe(250);
  });

  it('passes an explicit limit to getUsers, which previously had none', async () => {
    await invoke({ code: 'DEMO' });

    expect(mockGetUsers).toHaveBeenCalledWith(100, 0);
  });
});
