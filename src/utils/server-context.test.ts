/**
 * Server Context Tests
 *
 * Tests the AsyncLocalStorage-backed contexts and the destructive-action gate.
 *
 * The gate is fail-closed: a destructive tool runs only when the human said
 * yes. Every other outcome — no request context, a client on a protocol
 * revision that cannot be asked, a decline, an answer that belongs to some
 * other confirmation — refuses the call and names why.
 *
 * WHAT MOVED. The gate used to `await server.elicitInput(...)` inside the
 * call, so these tests drove a mock `Server`. Serving is per-request now: the
 * gate RETURNS a request for input (as an `InputRequiredSignal` the tools/call
 * handler unwraps) and reads the answer off the client's retry. So the fixture
 * is a fake request context rather than a fake server, and the scenarios are
 * the same ones, expressed against the new mechanism.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { Server, ServerContext } from '@modelcontextprotocol/server';
import {
  serverStorage,
  getServer,
  requestContextStorage,
  getRequestContext,
  InputRequiredSignal,
  confirmDestructiveAction,
  describeRefusal,
} from './server-context.js';
import { getRequestStateCodec } from './request-state.js';

/**
 * A request context shaped the way the seam hands one to a handler.
 *
 * `envelope` present is the 2026-07-28 era (a per-request `_meta` envelope);
 * `envelope: undefined` is a 2025-era client, which this server cannot ask.
 * `inputResponses` + `requestState` are what a retried request carries.
 */
function fakeCtx(
  overrides: {
    envelope?: Record<string, unknown>;
    inputResponses?: Record<string, unknown>;
    requestState?: unknown;
    sub?: string;
  } = {},
): ServerContext {
  const { inputResponses, requestState, sub = 'user-a' } = overrides;
  // `envelope: undefined` has to mean "absent", not "fall back to the default"
  // — an absent envelope IS the 2025-era case under test.
  const envelope = 'envelope' in overrides ? overrides.envelope : {};
  return {
    mcpReq: {
      id: 1,
      method: 'tools/call',
      envelope,
      inputResponses,
      requestState: () => requestState,
    },
    http: { authInfo: { extra: { sub } } },
  } as unknown as ServerContext;
}

/** A context carrying an elicitation answer for the `confirm` key. */
function answered(action: 'accept' | 'decline' | 'cancel', tool: string | undefined) {
  return fakeCtx({
    inputResponses: { confirm: { action, ...(action === 'accept' && { content: {} }) } },
    requestState: tool === undefined ? undefined : { tool },
  });
}

/**
 * Mock of the Server surface the gate reads: what the client declared at
 * `initialize`. A per-request instance on a stateless leg saw no `initialize`
 * and so declares nothing — the default here.
 */
function createMockServer(capabilities: Record<string, unknown> = {}): Server {
  return { getClientCapabilities: () => capabilities } as unknown as Server;
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

  describe('getRequestContext', () => {
    it('returns undefined outside of requestContextStorage.run()', () => {
      expect(getRequestContext()).toBeUndefined();
    });

    it('returns the request context inside requestContextStorage.run()', async () => {
      const ctx = fakeCtx();
      await requestContextStorage.run(ctx, async () => {
        expect(getRequestContext()).toBe(ctx);
      });
    });

    it('isolates the context between concurrent requests', async () => {
      const a = fakeCtx({ sub: 'user-a' });
      const b = fakeCtx({ sub: 'user-b' });

      await Promise.all([
        requestContextStorage.run(a, async () => {
          await new Promise((r) => setTimeout(r, 10));
          expect(getRequestContext()).toBe(a);
        }),
        requestContextStorage.run(b, async () => {
          await new Promise((r) => setTimeout(r, 10));
          expect(getRequestContext()).toBe(b);
        }),
      ]);
    });
  });

  describe('confirmDestructiveAction', () => {
    it('refuses as unsupported when there is no request context', async () => {
      const result = await confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 });
      expect(result).toEqual({ allowed: false, reason: 'unsupported' });
    });

    // The old-era counterpart of "the client does not support elicitation":
    // a 2025-era request carries no per-request envelope, and on a stateless
    // leg its client cannot be asked at all. Refuse; do not ask.
    it('refuses as unsupported for a client on the older protocol revision', async () => {
      const result = await requestContextStorage.run(fakeCtx({ envelope: undefined }), () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toEqual({ allowed: false, reason: 'unsupported' });
    });

    // The one 2025-era case that CAN still be asked: a connection that is
    // stateful (the SSE transport, stdio on the 2025 era) saw an `initialize`
    // and declared elicitation, and the SDK's legacy shim turns the same
    // input-required return into a real `elicitation/create` on it. Refusing
    // here would drop a confirmation those clients can perfectly well answer.
    it('still asks a stateful 2025-era client that declared elicitation', async () => {
      const server = createMockServer({ elicitation: { form: {} } });

      await expect(
        serverStorage.run(server, () =>
          requestContextStorage.run(fakeCtx({ envelope: undefined }), () =>
            confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
          ),
        ),
      ).rejects.toBeInstanceOf(InputRequiredSignal);
    });

    it('refuses a 2025-era client that declared no elicitation', async () => {
      const server = createMockServer({});

      const result = await serverStorage.run(server, () =>
        requestContextStorage.run(fakeCtx({ envelope: undefined }), () =>
          confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
        ),
      );

      expect(result).toEqual({ allowed: false, reason: 'unsupported' });
    });

    it('never asks a client it cannot ask — it returns, it does not throw', async () => {
      await expect(
        requestContextStorage.run(fakeCtx({ envelope: undefined }), () =>
          confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
        ),
      ).resolves.toEqual({ allowed: false, reason: 'unsupported' });
    });

    it('allows when the answer is accept and the state names this tool', async () => {
      const result = await requestContextStorage.run(answered('accept', 'qase_case_delete'), () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 42 }),
      );

      expect(result).toEqual({ allowed: true });
    });

    it('refuses as declined when the user declines', async () => {
      const result = await requestContextStorage.run(answered('decline', 'qase_case_delete'), () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toEqual({ allowed: false, reason: 'declined' });
    });

    it('refuses as declined when the user cancels', async () => {
      const result = await requestContextStorage.run(answered('cancel', 'qase_case_delete'), () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toEqual({ allowed: false, reason: 'declined' });
    });

    // Accepting the prompt IS the confirmation — the client's own accept
    // button is the yes. A second checkbox inside the form only produced false
    // refusals: people confirmed the dialog and left the box at its default.
    it('allows on accept alone, whatever the form content is', async () => {
      const ctx = fakeCtx({
        inputResponses: { confirm: { action: 'accept' } },
        requestState: { tool: 'qase_case_delete' },
      });

      const result = await requestContextStorage.run(ctx, () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toEqual({ allowed: true });
    });

    // An accept is an answer to ONE confirmation. Replaying it against a
    // different tool must not open that tool's gate.
    it('does not allow an accept whose state names a different tool', async () => {
      const result = await requestContextStorage.run(answered('accept', 'qase_suite_delete'), () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toEqual({ allowed: false, reason: 'undeliverable' });
    });

    it('does not allow an accept that carries no state at all', async () => {
      const result = await requestContextStorage.run(answered('accept', undefined), () =>
        confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
      );

      expect(result).toEqual({ allowed: false, reason: 'undeliverable' });
    });

    describe('the first round', () => {
      /** Run the gate and return the signal it throws. */
      async function firstRound(tool: string, args: Record<string, unknown>) {
        try {
          await requestContextStorage.run(fakeCtx(), () => confirmDestructiveAction(tool, args));
        } catch (error) {
          return error as InputRequiredSignal;
        }
        throw new Error('expected confirmDestructiveAction to signal input-required');
      }

      it('signals input-required rather than returning a verdict', async () => {
        const signal = await firstRound('qase_case_delete', { code: 'TEST', id: 1 });

        expect(signal).toBeInstanceOf(InputRequiredSignal);
        expect(signal.result.resultType).toBe('input_required');
      });

      it('asks under the confirm key, naming the tool in the prompt', async () => {
        const signal = await firstRound('qase_case_delete', { code: 'TEST', id: 1 });

        const confirm = signal.result.inputRequests?.confirm as {
          method: string;
          params: { message: string; requestedSchema: Record<string, unknown> };
        };
        expect(confirm.method).toBe('elicitation/create');
        expect(confirm.params.message).toContain('qase_case_delete');
      });

      it('shows the arguments the action would act on', async () => {
        const signal = await firstRound('qase_suite_delete', { code: 'PROJ', id: 99 });

        const confirm = signal.result.inputRequests?.confirm as {
          params: { message: string };
        };
        expect(confirm.params.message).toContain('qase_suite_delete');
        expect(confirm.params.message).toContain('PROJ');
        expect(confirm.params.message).toContain('99');
      });

      it('asks for no form fields, so accepting is the whole answer', async () => {
        const signal = await firstRound('qase_case_delete', { code: 'TEST', id: 1 });

        const confirm = signal.result.inputRequests?.confirm as {
          params: { requestedSchema: { type: string; properties: unknown; required?: unknown } };
        };
        expect(confirm.params.requestedSchema.type).toBe('object');
        expect(confirm.params.requestedSchema.properties).toEqual({});
        expect(confirm.params.requestedSchema.required).toBeUndefined();
      });

      // This is what replaces `relatedRequestId`: correlation no longer rides
      // a stream id, it rides signed state the client echoes back. The state
      // must verify under this process's own codec and name the tool asked
      // about — otherwise the answer could not be matched on the retry.
      it('carries signed state naming the tool it asked about', async () => {
        const ctx = fakeCtx();
        let signal: InputRequiredSignal | undefined;
        try {
          await requestContextStorage.run(ctx, () =>
            confirmDestructiveAction('qase_case_delete', { code: 'TEST', id: 1 }),
          );
        } catch (error) {
          signal = error as InputRequiredSignal;
        }

        const state = signal?.result.requestState;
        expect(typeof state).toBe('string');
        await expect(getRequestStateCodec().verify(state!, ctx)).resolves.toEqual({
          tool: 'qase_case_delete',
        });
      });
    });
  });

  describe('describeRefusal', () => {
    it('tells a client that cannot be asked why the deletion was refused', () => {
      const text = describeRefusal('qase_case_delete', 'unsupported');
      expect(text).toContain('qase_case_delete');
      // The reason is the protocol revision the client speaks, and the fix is
      // named, so the agent can act on it rather than retrying blindly.
      expect(text).toContain('2025-11-25');
      expect(text).toContain('2026-07-28');
    });

    it('reports an unanswered prompt as unconfirmed, not as a failure to delete', () => {
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
