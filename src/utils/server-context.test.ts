/**
 * Server Context Tests
 *
 * Tests AsyncLocalStorage-based server context and the destructive-action gate.
 *
 * The gate is fail-closed: a destructive tool runs only when the human said yes.
 * Every other outcome — no elicitation capability, an undelivered prompt, a
 * decline — refuses the call and names why.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  serverStorage,
  getServer,
  confirmDestructiveAction,
  describeRefusal,
} from './server-context.js';

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
          elicitResult ?? { action: 'accept', content: {} },
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
    it('refuses as unsupported when no server in context', async () => {
      const result = await confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 });
      expect(result).toEqual({ allowed: false, reason: 'unsupported' });
    });

    it('refuses as unsupported when client does not support elicitation', async () => {
      const server = createMockServer({ elicitation: false });

      const result = await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toEqual({ allowed: false, reason: 'unsupported' });
      expect(server.elicitInput).not.toHaveBeenCalled();
    });

    it('allows when user confirms (accept + confirm=true)', async () => {
      const server = createMockServer({
        elicitResult: { action: 'accept', content: { confirm: true } },
      });

      const result = await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 42 }),
      );

      expect(result).toEqual({ allowed: true });
      expect(server.elicitInput).toHaveBeenCalledTimes(1);
      const call = server.elicitInput.mock.calls[0][0];
      expect(call.message).toContain('qase_case_delete');
    });

    it('refuses as declined when user declines (action=decline)', async () => {
      const server = createMockServer({ elicitResult: { action: 'decline' } });

      const result = await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toEqual({ allowed: false, reason: 'declined' });
    });

    it('refuses as declined when user cancels (action=cancel)', async () => {
      const server = createMockServer({ elicitResult: { action: 'cancel' } });

      const result = await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toEqual({ allowed: false, reason: 'declined' });
    });

    // Accepting the prompt IS the confirmation — the client's own accept button
    // is the yes. A second checkbox inside the form only produced false refusals:
    // people confirmed the dialog and left the box at its default.
    it('allows on accept alone, whatever the form content is', async () => {
      const server = createMockServer({ elicitResult: { action: 'accept' } });

      const result = await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toEqual({ allowed: true });
    });

    it('refuses as undeliverable when elicitation throws', async () => {
      const server = createMockServer({ elicitError: new Error('client disconnected') });

      const result = await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toEqual({ allowed: false, reason: 'undeliverable' });
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

    it('asks for no form fields, so accepting is the whole answer', async () => {
      const server = createMockServer();

      await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      const call = server.elicitInput.mock.calls[0][0];
      expect(call.requestedSchema.type).toBe('object');
      expect(call.requestedSchema.properties).toEqual({});
      expect(call.requestedSchema.required).toBeUndefined();
    });

    // The whole point of the fix: without relatedRequestId the SDK routes the
    // prompt to the standalone SSE stream nobody opened, and it is dropped.
    it('routes the prompt to the stream of the originating call', async () => {
      const server = createMockServer();

      await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }, 7),
      );

      const options = server.elicitInput.mock.calls[0][1];
      expect(options).toEqual(expect.objectContaining({ relatedRequestId: 7 }));
    });

    it('omits relatedRequestId when the caller has no request id', async () => {
      const server = createMockServer();

      await serverStorage.run(server, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      const options = server.elicitInput.mock.calls[0][1];
      expect(options?.relatedRequestId).toBeUndefined();
    });
  });

  describe('describeRefusal', () => {
    it('tells an elicitation-less client why the deletion was refused', () => {
      const text = describeRefusal('qase_case_delete', 'unsupported');
      expect(text).toContain('qase_case_delete');
      expect(text).toContain('elicitation');
    });

    it('reports an undelivered prompt as unconfirmed, not as a failure to delete', () => {
      const text = describeRefusal('qase_case_delete', 'undeliverable');
      expect(text).toContain('qase_case_delete');
      expect(text).toContain('not confirmed');
    });

    it('states plainly that the user declined', () => {
      const text = describeRefusal('qase_case_delete', 'declined');
      expect(text).toContain('qase_case_delete');
      expect(text).toContain('declined');
    });
  });
});
