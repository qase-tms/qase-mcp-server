import { hashToken, buildCacheKey } from './keys.js';

describe('hashToken', () => {
  it('returns a 32-character hex string', () => {
    const hash = hashToken('abc123');
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is deterministic — same input, same output', () => {
    expect(hashToken('token-A')).toBe(hashToken('token-A'));
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken('token-A')).not.toBe(hashToken('token-B'));
  });

  it('throws on empty token to prevent accidental global keys', () => {
    expect(() => hashToken('')).toThrow('token must be non-empty');
  });
});

describe('buildCacheKey', () => {
  it('produces a v1-prefixed colon-delimited key with all parts', () => {
    const key = buildCacheKey({
      host: 'api.qase.io',
      tenantId: 'a'.repeat(32),
      resource: 'project_context',
      scope: 'DEMO',
      params: { limit: 10 },
    });
    expect(key).toBe(`v1:api.qase.io:${'a'.repeat(32)}:project_context:DEMO:{"limit":10}`);
  });

  it('omits scope and params when not provided', () => {
    const key = buildCacheKey({
      host: 'api.qase.io',
      tenantId: 'b'.repeat(32),
      resource: 'system_fields',
    });
    expect(key).toBe(`v1:api.qase.io:${'b'.repeat(32)}:system_fields::`);
  });

  it('serializes params with sorted keys so order does not matter', () => {
    const k1 = buildCacheKey({
      host: 'h',
      tenantId: 't',
      resource: 'r',
      params: { b: 2, a: 1 },
    });
    const k2 = buildCacheKey({
      host: 'h',
      tenantId: 't',
      resource: 'r',
      params: { a: 1, b: 2 },
    });
    expect(k1).toBe(k2);
  });
});
