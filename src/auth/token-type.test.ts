import { describe, it, expect } from '@jest/globals';
import { isJwt } from './token-type.js';

describe('isJwt', () => {
  it('returns true for a three-segment token', () => {
    expect(isJwt('aaa.bbb.ccc')).toBe(true);
  });

  it('returns false for an opaque api-token', () => {
    expect(isJwt('1a2b3c4d5e6f')).toBe(false);
  });

  it('returns false for two segments or empty segments', () => {
    expect(isJwt('aaa.bbb')).toBe(false);
    expect(isJwt('aaa..ccc')).toBe(false);
    expect(isJwt('')).toBe(false);
  });
});
