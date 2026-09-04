/**
 * Tests for the qase_api escape hatch.
 *
 * The tool is annotated destructiveHint: false, because most calls through it
 * are reads and requiring confirmation for a GET would be absurd. That leaves
 * DELETE unguarded — and a DELETE here can remove an entire project — so the
 * handler asks for confirmation itself, based on the method actually used.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { setTestEnv } from '../../utils/test-helpers.js';

setTestEnv();

const mockRequest = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockConfirm =
  jest.fn<
    (
      ...args: unknown[]
    ) => Promise<{ allowed: true } | { allowed: false; reason: 'declined' | 'unsupported' }>
  >();

jest.mock('../../client/index.js', () => ({
  getApiClient: () => ({ request: mockRequest }),
}));

jest.mock('../../utils/server-context.js', () => {
  const actual = jest.requireActual('../../utils/server-context.js') as Record<string, unknown>;
  return { ...actual, confirmDestructiveAction: mockConfirm };
});

import './api.js';
import { toolRegistry } from '../../utils/registry.js';
import { ToolExecutionError } from '../../utils/errors.js';

function invoke(args: Record<string, unknown>) {
  return toolRegistry.getHandler('qase_api')!(args);
}

beforeEach(() => {
  mockRequest.mockReset().mockResolvedValue({ data: { status: true } });
  mockConfirm.mockReset().mockResolvedValue({ allowed: true });
});

describe('reads and writes that are not deletions', () => {
  it('does not ask for confirmation on a GET', async () => {
    await invoke({ method: 'GET', path: '/v1/project' });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalled();
  });

  it('does not ask for confirmation on a POST', async () => {
    await invoke({ method: 'POST', path: '/v1/project', body: { title: 'X', code: 'X' } });

    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalled();
  });
});

describe('DELETE', () => {
  it('asks for confirmation before deleting, naming the path', async () => {
    await invoke({ method: 'DELETE', path: '/v1/project/DEMO' });

    expect(mockConfirm).toHaveBeenCalledTimes(1);
    const [toolName, args] = mockConfirm.mock.calls[0] as unknown as [string, unknown];
    expect(toolName).toBe('qase_api');
    expect(JSON.stringify(args)).toContain('/v1/project/DEMO');
  });

  it('makes the request once confirmed', async () => {
    await invoke({ method: 'DELETE', path: '/v1/project/DEMO' });

    expect(mockRequest).toHaveBeenCalled();
  });

  it('does not touch the API when the user declines, and does not call it a failure', async () => {
    mockConfirm.mockResolvedValue({ allowed: false, reason: 'declined' });

    const result = (await invoke({ method: 'DELETE', path: '/v1/project/DEMO' })) as {
      cancelled?: boolean;
      message?: string;
    };

    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.cancelled).toBe(true);
    expect(result.message).toContain('declined');
  });

  // Throwing is what earns `isError: true` from the tools/call handler; a
  // returned object would be serialised as an ordinary successful result.
  it('throws instead of deleting when the client cannot be asked', async () => {
    mockConfirm.mockResolvedValue({ allowed: false, reason: 'unsupported' });

    await expect(invoke({ method: 'DELETE', path: '/v1/project/DEMO' })).rejects.toThrow(
      /elicitation/,
    );
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('throws a ToolExecutionError, the class the handler turns into isError', async () => {
    mockConfirm.mockResolvedValue({ allowed: false, reason: 'unsupported' });

    await expect(invoke({ method: 'DELETE', path: '/v1/project/DEMO' })).rejects.toBeInstanceOf(
      ToolExecutionError,
    );
  });
});
