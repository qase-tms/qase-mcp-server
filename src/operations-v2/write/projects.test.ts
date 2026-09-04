/**
 * Tests for qase_project_create / qase_project_delete.
 *
 * The API has no update for a project, so creation is a plain create rather
 * than the upsert shape the other write tools use.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockCreateProject = jest.fn();
const mockDeleteProject = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    projects: { createProject: mockCreateProject, deleteProject: mockDeleteProject },
  }),
}));

import './projects.js';
import { toolRegistry } from '../../utils/registry.js';

function invoke(tool: string, args: Record<string, unknown>) {
  return toolRegistry.getHandler(tool)!(args);
}

const sentBody = () => mockCreateProject.mock.calls[0][0] as Record<string, unknown>;

beforeEach(() => {
  mockCreateProject
    .mockReset()
    .mockResolvedValue({ data: { status: true, result: { code: 'NEW' } } });
  mockDeleteProject.mockReset().mockResolvedValue({ data: { status: true } });
});

describe('registration', () => {
  it('registers both tools as discoverable', () => {
    expect(toolRegistry.hasTool('qase_project_create')).toBe(true);
    expect(toolRegistry.hasTool('qase_project_delete')).toBe(true);
    const listed = toolRegistry.getTools().map((t) => t.name);
    expect(listed).not.toContain('qase_project_create');
    expect(listed).not.toContain('qase_project_delete');
  });

  it('marks deletion destructive so the confirmation gate covers it', () => {
    expect(toolRegistry.getTool('qase_project_delete')?.annotations?.destructiveHint).toBe(true);
    expect(toolRegistry.getTool('qase_project_create')?.annotations?.destructiveHint).toBe(false);
  });

  it('warns in the description that deleting a project takes everything with it', () => {
    const description = toolRegistry.getTool('qase_project_delete')?.description ?? '';
    expect(description.toLowerCase()).toContain('cannot be undone');
  });
});

describe('qase_project_create', () => {
  it('creates a project and returns its code', async () => {
    const result = await invoke('qase_project_create', { title: 'New', code: 'NEW' });

    expect(sentBody()).toEqual({ title: 'New', code: 'NEW' });
    expect(result).toEqual({ code: 'NEW' });
  });

  it('passes the optional fields through', async () => {
    await invoke('qase_project_create', {
      title: 'New',
      code: 'NEW',
      description: 'desc',
      access: 'none',
    });

    expect(sentBody()).toMatchObject({ description: 'desc', access: 'none' });
  });

  it('rejects access "group" without a group hash, before calling the API', async () => {
    await expect(
      invoke('qase_project_create', { title: 'New', code: 'NEW', access: 'group' }),
    ).rejects.toThrow(/group/i);
    expect(mockCreateProject).not.toHaveBeenCalled();
  });

  it('accepts access "group" when the group hash is given', async () => {
    await invoke('qase_project_create', {
      title: 'New',
      code: 'NEW',
      access: 'group',
      group: 'abc123',
    });

    expect(sentBody()).toMatchObject({ access: 'group', group: 'abc123' });
  });
});

describe('qase_project_delete', () => {
  it('deletes by project code', async () => {
    const result = await invoke('qase_project_delete', { code: 'OLD' });

    expect(mockDeleteProject).toHaveBeenCalledWith('OLD');
    expect(result).toEqual({ success: true, code: 'OLD' });
  });

  it('surfaces an API failure as a tool error', async () => {
    mockDeleteProject.mockRejectedValue(new Error('boom'));

    await expect(invoke('qase_project_delete', { code: 'OLD' })).rejects.toThrow();
  });
});
