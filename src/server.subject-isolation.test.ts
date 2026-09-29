/**
 * Cross-caller tool activation isolation.
 *
 * This is the bug the whole "registry stops storing activation" task exists
 * to fix: one caller's `qase_discover_tools` used to switch tools on for
 * every caller, because activation lived in a process-wide Set. It is now
 * per-subject state (src/tools/activation.ts), and the subject comes from
 * `ctx.http.authInfo.extra.sub` (src/server.ts's `subjectFromContext`) — the
 * one property path that has already been written wrong twice while this
 * task was being planned (`authInfo.sub`, then `ctx.authInfo`). A wrong path
 * there silently collapses every caller back onto one shared bucket, which
 * is exactly the bug this task fixes — so it needs a test that actually
 * drives two distinct subjects through the real dispatch path, not just the
 * activation store in isolation.
 *
 * This goes through `createServer()`'s real `tools/list` and `tools/call`
 * handlers via the same `InMemoryTransport` + `Client` pairing
 * `spec-compliance.test.ts` already uses, rather than standing up an actual
 * network transport. `InMemoryTransport.send()` accepts an `authInfo` option
 * for exactly this purpose (its own doc comment: "useful for testing
 * authentication scenarios"); `Client.request()` doesn't forward it itself,
 * so `asSubject()` below patches `send` for the duration of one call — the
 * same field a real HTTP transport's bearer-auth verifier
 * (src/auth/jwks-verifier.ts) would populate from a JWT's `sub` claim.
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { setTestEnv } from './utils/test-helpers.js';
import { requestTokenStorage } from './utils/auth-context.js';

setTestEnv();

// The operation modules build an API client on import; stub it away.
jest.mock('./client/index.js', () => {
  const mockResponse = Promise.resolve({ data: { status: true, result: {} } });
  const createDeepProxy = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
          const fn = jest.fn().mockReturnValue(mockResponse);
          return new Proxy(fn, {
            get(fnTarget, fnProp) {
              if (fnProp in fnTarget) return (fnTarget as any)[fnProp];
              return jest.fn().mockReturnValue(mockResponse);
            },
          });
        },
      },
    );

  return {
    getApiClient: jest.fn().mockReturnValue(createDeepProxy()),
    apiRequest: jest.fn().mockResolvedValue({ status: true, result: {} }),
    resetClientInstance: jest.fn(),
  };
});

import { createServer } from './server.js';

let client: Client;
let clientTransport: InMemoryTransport;

beforeAll(async () => {
  const [ct, serverTransport] = InMemoryTransport.createLinkedPair();
  clientTransport = ct;
  client = new Client({ name: 'subject-isolation-test', version: '1.0.0' });
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
});

afterAll(async () => {
  await client.close();
});

/**
 * Run `fn` with every outbound message it sends carrying `sub` as the
 * caller's `authInfo.extra.sub` (or no `authInfo` at all when `sub` is
 * `undefined`, simulating OAuth being off / no token on the request).
 */
async function asSubject<T>(sub: string | undefined, fn: () => Promise<T>): Promise<T> {
  const transport = clientTransport as unknown as { send: (...args: any[]) => Promise<void> };
  const original = transport.send.bind(transport);
  const authInfo = sub === undefined ? undefined : { extra: { sub } };
  transport.send = (message: unknown, options?: Record<string, unknown>) =>
    original(message, { ...options, authInfo });
  try {
    return await fn();
  } finally {
    transport.send = original;
  }
}

describe('tool activation is isolated per caller subject', () => {
  it('one caller activating a tool is invisible to another, and the local fallback still works', async () => {
    // user-a activates a discoverable tool via qase_discover_tools.
    const discovered = (await asSubject('user-a', () =>
      client.callTool({ name: 'qase_discover_tools', arguments: { query: 'milestone' } }),
    )) as { isError?: boolean };
    expect(discovered.isError).not.toBe(true);

    // Same subject, a later call: the activated tool is now visible.
    const { tools: userATools } = await asSubject('user-a', () => client.listTools());
    expect(userATools.map((t) => t.name)).toContain('qase_milestone_upsert');

    // A different subject never activated it: absent from ITS tool list.
    const { tools: userBTools } = await asSubject('user-b', () => client.listTools());
    expect(userBTools.map((t) => t.name)).not.toContain('qase_milestone_upsert');

    // No authInfo at all (OAuth off / no token): the shared 'local' subject
    // still gets served — the core set, untouched by either user's activation.
    const { tools: localTools } = await client.listTools();
    expect(localTools.map((t) => t.name)).toContain('qase_get');
    expect(localTools.map((t) => t.name)).not.toContain('qase_milestone_upsert');
  });

  // F1: OAuth off (or an opaque token passed through with OAuth on) leaves
  // `extra.sub` unset, so every one of these callers hits the same
  // `subjectFromContext` fallback. Without a per-token digest they all
  // collapse onto the single 'local' bucket — this is the concrete failure
  // in the finding: two self-run users, each with their own Qase token, see
  // each other's `qase_discover_tools` activations.
  it('falls back to a digest of the per-request token when there is no sub, keeping different callers isolated', async () => {
    await requestTokenStorage.run('token-a', () =>
      asSubject(undefined, () =>
        client.callTool({ name: 'qase_discover_tools', arguments: { query: 'milestone' } }),
      ),
    );

    // Same token, a later request: the activation is visible.
    const { tools: tokenATools } = await requestTokenStorage.run('token-a', () =>
      asSubject(undefined, () => client.listTools()),
    );
    expect(tokenATools.map((t) => t.name)).toContain('qase_milestone_upsert');

    // A different token never activated it: absent from ITS tool list, even
    // though neither request carries a `sub`.
    const { tools: tokenBTools } = await requestTokenStorage.run('token-b', () =>
      asSubject(undefined, () => client.listTools()),
    );
    expect(tokenBTools.map((t) => t.name)).not.toContain('qase_milestone_upsert');
  });

  it('keys on the OAuth sub rather than the token when both are present', async () => {
    await requestTokenStorage.run('token-1', () =>
      asSubject('user-sub', () =>
        client.callTool({ name: 'qase_discover_tools', arguments: { query: 'milestone' } }),
      ),
    );

    // Same sub, a different token (e.g. a rotated credential): still keyed
    // on the sub, so the earlier activation is still visible.
    const { tools } = await requestTokenStorage.run('token-2', () =>
      asSubject('user-sub', () => client.listTools()),
    );
    expect(tools.map((t) => t.name)).toContain('qase_milestone_upsert');
  });

  it('falls back to the shared local subject when there is neither a sub nor a token', async () => {
    const { tools } = await asSubject(undefined, () => client.listTools());
    expect(tools.map((t) => t.name)).not.toContain('qase_milestone_upsert');
    expect(tools.map((t) => t.name)).toContain('qase_get');
  });
});
