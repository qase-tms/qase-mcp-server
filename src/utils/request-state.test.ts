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
import {
  createRequestStateCodecFromEnv,
  digestArguments,
  CONFIRMATION_TTL_SECONDS,
} from './request-state.js';

const ctx = { mcpReq: { method: 'tools/call' }, http: { authInfo: { extra: { sub: 'user-a' } } } };
const otherCaller = {
  mcpReq: { method: 'tools/call' },
  http: { authInfo: { extra: { sub: 'user-b' } } },
};

describe('request state signing', () => {
  it('round-trips a payload it minted itself', async () => {
    const codec = createRequestStateCodecFromEnv({ QASE_MCP_REQUEST_STATE_KEY: 'x'.repeat(32) });

    const wire = await codec.mint(
      { tool: 'qase_case_delete', arguments: digestArguments({ id: 1 }) },
      ctx as never,
    );
    await expect(codec.verify(wire, ctx as never)).resolves.toMatchObject({
      tool: 'qase_case_delete',
    });
  });

  // The window a human's answer races against. It is the number that decides
  // how long an unanswered prompt stays answerable, so it is stated in the
  // code rather than inherited from the SDK's default.
  it('stamps the confirmation with the configured lifetime', async () => {
    const codec = createRequestStateCodecFromEnv({ QASE_MCP_REQUEST_STATE_KEY: 'x'.repeat(32) });

    const wire = await codec.mint({ tool: 'qase_case_delete', arguments: 'd' }, ctx as never);
    // Wire shape is `v1.<base64url(body)>.<base64url(mac)>`; the body carries
    // the expiry the codec will enforce.
    const body = JSON.parse(
      Buffer.from(wire.slice(3, wire.lastIndexOf('.')), 'base64url').toString('utf8'),
    ) as { exp: number };

    const lifetime = body.exp - Math.floor(Date.now() / 1000);
    expect(CONFIRMATION_TTL_SECONDS).toBe(600);
    expect(lifetime).toBeGreaterThan(CONFIRMATION_TTL_SECONDS - 5);
    expect(lifetime).toBeLessThanOrEqual(CONFIRMATION_TTL_SECONDS);
  });

  it('rejects a value signed with a different key', async () => {
    const mine = createRequestStateCodecFromEnv({ QASE_MCP_REQUEST_STATE_KEY: 'x'.repeat(32) });
    const theirs = createRequestStateCodecFromEnv({ QASE_MCP_REQUEST_STATE_KEY: 'y'.repeat(32) });

    const foreign = await theirs.mint(
      { tool: 'qase_case_delete', arguments: digestArguments({ id: 1 }) },
      ctx as never,
    );
    await expect(mine.verify(foreign, ctx as never)).rejects.toThrow();
  });

  it('rejects a confirmation minted for another caller', async () => {
    const codec = createRequestStateCodecFromEnv({ QASE_MCP_REQUEST_STATE_KEY: 'x'.repeat(32) });

    const wire = await codec.mint(
      { tool: 'qase_case_delete', arguments: digestArguments({ id: 1 }) },
      ctx as never,
    );
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

  // A confirmation names the arguments it was given, not just the tool, so the
  // digest has to agree on two objects that differ only in key order — the
  // same call written two ways is the same call.
  describe('argument digest', () => {
    it('is stable across key order, at any depth', () => {
      expect(digestArguments({ code: 'TEST', id: 1 })).toBe(
        digestArguments({ id: 1, code: 'TEST' }),
      );
      expect(digestArguments({ a: { x: 1, y: 2 }, b: 3 })).toBe(
        digestArguments({ b: 3, a: { y: 2, x: 1 } }),
      );
    });

    it('keeps array order, which is part of the value', () => {
      expect(digestArguments({ ids: [1, 2] })).not.toBe(digestArguments({ ids: [2, 1] }));
    });

    it('changes when any argument changes', () => {
      const confirmed = digestArguments({ code: 'TEST', id: 1 });
      expect(digestArguments({ code: 'TEST', id: 999 })).not.toBe(confirmed);
      expect(digestArguments({ code: 'PROD', id: 1 })).not.toBe(confirmed);
      expect(digestArguments({})).not.toBe(confirmed);
    });

    it('is a hex sha256, so it can go in a signed payload as-is', () => {
      expect(digestArguments({ id: 1 })).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
