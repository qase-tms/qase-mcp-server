/**
 * Request state signing.
 *
 * `requestState` is the only thing that survives a multi-round-trip
 * confirmation, and it survives it by travelling through the client. Whatever
 * comes back is attacker-controlled input, so the codec has to prove it minted
 * the value itself, and minted it for THIS caller — a confirmation issued to
 * one authenticated user must not be usable by another.
 */

import { describe, it, expect } from '@jest/globals';
import { createRequestStateCodecFromEnv } from './request-state.js';

const ctx = { mcpReq: { method: 'tools/call' }, http: { authInfo: { extra: { sub: 'user-a' } } } };
const otherCaller = {
  mcpReq: { method: 'tools/call' },
  http: { authInfo: { extra: { sub: 'user-b' } } },
};

describe('request state signing', () => {
  it('round-trips a payload it minted itself', async () => {
    const codec = createRequestStateCodecFromEnv({ QASE_MCP_REQUEST_STATE_KEY: 'x'.repeat(32) });

    const wire = await codec.mint({ tool: 'qase_case_delete' }, ctx as never);
    await expect(codec.verify(wire, ctx as never)).resolves.toMatchObject({
      tool: 'qase_case_delete',
    });
  });

  it('rejects a value signed with a different key', async () => {
    const mine = createRequestStateCodecFromEnv({ QASE_MCP_REQUEST_STATE_KEY: 'x'.repeat(32) });
    const theirs = createRequestStateCodecFromEnv({ QASE_MCP_REQUEST_STATE_KEY: 'y'.repeat(32) });

    const foreign = await theirs.mint({ tool: 'qase_case_delete' }, ctx as never);
    await expect(mine.verify(foreign, ctx as never)).rejects.toThrow();
  });

  it('rejects a confirmation minted for another caller', async () => {
    const codec = createRequestStateCodecFromEnv({ QASE_MCP_REQUEST_STATE_KEY: 'x'.repeat(32) });

    const wire = await codec.mint({ tool: 'qase_case_delete' }, ctx as never);
    await expect(codec.verify(wire, otherCaller as never)).rejects.toThrow();
  });

  it('generates a key when none is configured, so a single replica still works', () => {
    expect(() => createRequestStateCodecFromEnv({})).not.toThrow();
  });

  it('refuses a configured key that is too short to be a key', () => {
    expect(() => createRequestStateCodecFromEnv({ QASE_MCP_REQUEST_STATE_KEY: 'short' })).toThrow(
      /QASE_MCP_REQUEST_STATE_KEY/,
    );
  });
});
