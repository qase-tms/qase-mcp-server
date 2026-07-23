/**
 * Server Context Tests
 *
 * Tests AsyncLocalStorage-based server context and elicitation logic.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { serverStorage, getServer, confirmDestructiveAction } from './server-context.js';

// Minimal mock of the Server interface — only the methods we use
function createMockServer(overrides: {
  elicitation?: boolean;
  elicitResult?: { action: string; content?: Record<string, unknown> };
  elicitError?: Error;
} = {}) {
  const { elicitation = true, elicitResult, elicitError } = overrides;

  return {
    getClientCapabilities: jest.fn().mockReturnValue(
      elicitation ? { elicitation: { form: {} } } : {},
    ),
    elicitInput: elicitError
      ? jest.fn().mockRejectedValue(elicitError)
      : jest.fn().mockResolvedValue(
          elicitResult ?? { action: 'accept', content: { confirm: true } },
        ),
  } as any;
}

describe('Server Context', () => {
  let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  describe('getServer', () => {
    it('returns undefined outside of serverStorage.run()', () => {
      expect(getServer()).toBeUndefined();
    });

    it('returns the server inside serverStorage.run()', async () => {
      const mockServer = createMockServer();
      await serverStorage.run(mockServer, async () => {
        expect(getServer()).toBe(mockServer);
      });
    });

    it('isolates server between concurrent contexts', async () => {
      const server1 = createMockServer();
      const server2 = createMockServer();

      await Promise.all([
        serverStorage.run(server1, async () => {
          await new Promise((r) => setTimeout(r, 10));
          expect(getServer()).toBe(server1);
        }),
        serverStorage.run(server2, async () => {
          await new Promise((r) => setTimeout(r, 10));
          expect(getServer()).toBe(server2);
        }),
      ]);
    });
  });

  describe('confirmDestructiveAction', () => {
    it('returns true when no server in context', async () => {
      const result = await confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 });
      expect(result).toBe(true);
    });

    it('returns true when client does not support elicitation', async () => {
      const server = createMockServer({ elicitation: false });

      const result = await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toBe(true);
      expect(server.elicitInput).not.toHaveBeenCalled();
    });

    it('returns true when user confirms (accept + confirm=true)', async () => {
      const server = createMockServer({
        elicitResult: { action: 'accept', content: { confirm: true } },
      });

      const result = await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 42 }),
      );

      expect(result).toBe(true);
      expect(server.elicitInput).toHaveBeenCalledTimes(1);
      // Verify the elicitation message contains the tool name
      const call = server.elicitInput.mock.calls[0][0];
      expect(call.message).toContain('qase_case_delete');
    });

    it('returns false when user declines (action=decline)', async () => {
      const server = createMockServer({
        elicitResult: { action: 'decline' },
      });

      const result = await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toBe(false);
    });

    it('returns false when user cancels (action=cancel)', async () => {
      const server = createMockServer({
        elicitResult: { action: 'cancel' },
      });

      const result = await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toBe(false);
    });

    it('returns false when user accepts but confirm=false', async () => {
      const server = createMockServer({
        elicitResult: { action: 'accept', content: { confirm: false } },
      });

      const result = await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toBe(false);
    });

    it('returns true on elicitation error (graceful degradation)', async () => {
      const server = createMockServer({
        elicitError: new Error('client disconnected'),
      });

      const result = await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toBe(true);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Elicitation failed'),
        expect.any(Error),
      );
    });

    it('includes tool args in the elicitation message', async () => {
      const server = createMockServer();

      await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_suite_delete', { code: 'PROJ', id: 99 }),
      );

      const call = server.elicitInput.mock.calls[0][0];
      expect(call.message).toContain('qase_suite_delete');
      expect(call.message).toContain('PROJ');
      expect(call.message).toContain('99');
    });

    it('sends correct schema with boolean confirm field', async () => {
      const server = createMockServer();

      await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      const call = server.elicitInput.mock.calls[0][0];
      expect(call.requestedSchema.type).toBe('object');
      expect(call.requestedSchema.properties.confirm.type).toBe('boolean');
      expect(call.requestedSchema.required).toContain('confirm');
    });
  });
});
