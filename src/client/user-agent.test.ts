import { describe, it, expect, afterEach } from '@jest/globals';
import { getUserAgent } from './index.js';
import { VERSION } from '../version.js';

describe('getUserAgent (Qase API source)', () => {
  afterEach(() => {
    delete process.env.QASE_MCP_SOURCE;
  });

  it('defaults to qase-mcp when QASE_MCP_SOURCE is unset', () => {
    delete process.env.QASE_MCP_SOURCE;
    expect(getUserAgent()).toBe(`qase-mcp/${VERSION}`);
  });

  it('uses qase-mcp-hosted when QASE_MCP_SOURCE is set (hosted deployment)', () => {
    process.env.QASE_MCP_SOURCE = 'qase-mcp-hosted';
    expect(getUserAgent()).toBe(`qase-mcp-hosted/${VERSION}`);
  });

  it('trims whitespace and falls back to qase-mcp for an empty value', () => {
    process.env.QASE_MCP_SOURCE = '   ';
    expect(getUserAgent()).toBe(`qase-mcp/${VERSION}`);
  });
});
