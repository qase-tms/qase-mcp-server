/**
 * Tests for qase_defect_upsert.
 *
 * The defect API takes `severity` as the numeric ID from the workspace's
 * `severity` system field and rejects the label outright — with nothing but
 * "Data is invalid" to say why. The tool advertises labels, so without
 * normalisation no defect could ever be created: verified against the live API
 * on two projects before this was written.
 */

import { describe, it, expect, beforeEach, beforeAll } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockResolve = jest.fn();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({
    defects: { createDefect: mockCreate, updateDefect: mockUpdate, resolveDefect: mockResolve },
  }),
}));

import './defects.js';
import { toolRegistry } from '../../utils/registry.js';
import { __setCaseEnumCacheForTest } from '../../utils/case-enums.js';

function invoke(args: Record<string, unknown>) {
  return toolRegistry.getHandler('qase_defect_upsert')!(args);
}

const createdBody = () => mockCreate.mock.calls[0][1] as Record<string, unknown>;
const updatedBody = () => mockUpdate.mock.calls[0][2] as Record<string, unknown>;

beforeAll(async () => {
  // The workspace's real severity options, including a custom one — which is
  // why the mapping is read from system fields rather than hard-coded.
  await __setCaseEnumCacheForTest({
    severity: {
      undefined: 0,
      blocker: 1,
      critical: 2,
      major: 3,
      normal: 4,
      minor: 5,
      trivial: 6,
      new2: 7,
      '3': 3,
    },
  });
});

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({ data: { status: true, result: { id: 1 } } });
  mockUpdate.mockReset().mockResolvedValue({ data: { status: true, result: { id: 1 } } });
  mockResolve.mockReset().mockResolvedValue({ data: { status: true, result: { id: 1 } } });
});

describe('severity reaches the API as a number', () => {
  it('maps a severity label to its numeric ID when creating', async () => {
    await invoke({ code: 'TEST', title: 'boom', actual_result: 'x', severity: 'major' });

    expect(createdBody().severity).toBe(3);
  });

  it('maps every label the schema advertises', async () => {
    for (const [label, code] of [
      ['blocker', 1],
      ['critical', 2],
      ['major', 3],
      ['normal', 4],
      ['minor', 5],
      ['trivial', 6],
    ] as const) {
      mockCreate.mockClear();
      await invoke({ code: 'TEST', title: 't', actual_result: 'x', severity: label });
      expect((mockCreate.mock.calls[0][1] as Record<string, unknown>).severity).toBe(code);
    }
  });

  it('maps the label when updating too', async () => {
    await invoke({ code: 'TEST', id: 7, severity: 'minor' });

    expect(updatedBody().severity).toBe(5);
  });

  it('leaves an update that carries no severity alone', async () => {
    await invoke({ code: 'TEST', id: 7, title: 'renamed' });

    expect(updatedBody()).not.toHaveProperty('severity');
    expect(updatedBody().title).toBe('renamed');
  });

  // Resolving has its own endpoint, so it must not be routed through the
  // ordinary update — normalising severity must not disturb that.
  it('still resolves through the resolve endpoint', async () => {
    await invoke({ code: 'TEST', id: 7, status: 'resolved' });

    expect(mockResolve).toHaveBeenCalledWith('TEST', 7);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  // The API takes the status label as-is; mapping it would break resolving.
  it('passes status through as the label it is', async () => {
    await invoke({ code: 'TEST', title: 't', actual_result: 'x', severity: 'major', status: 'open' });

    expect(createdBody().status).toBe('open');
  });
});
