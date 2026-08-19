import { describe, it, expect, afterEach } from '@jest/globals';
import { integrationStorage, getIntegration } from './integration-context.js';

afterEach(() => {
  delete process.env.QASE_MCP_INTEGRATION;
});

describe('getIntegration', () => {
  it('returns undefined with no context and no env var', () => {
    expect(getIntegration()).toBeUndefined();
  });

  it('returns the request-scoped value', () => {
    integrationStorage.run('quality-supervisor/1.0.0', () => {
      expect(getIntegration()).toBe('quality-supervisor/1.0.0');
    });
  });

  it('falls back to QASE_MCP_INTEGRATION outside any scope', () => {
    process.env.QASE_MCP_INTEGRATION = 'quality-supervisor/2.0.0';
    expect(getIntegration()).toBe('quality-supervisor/2.0.0');
  });

  it('falls back to the env var when the request carried no marker', () => {
    process.env.QASE_MCP_INTEGRATION = 'quality-supervisor/2.0.0';
    integrationStorage.run('', () => {
      expect(getIntegration()).toBe('quality-supervisor/2.0.0');
    });
  });

  it('prefers the request-scoped value over the env var', () => {
    process.env.QASE_MCP_INTEGRATION = 'quality-supervisor/2.0.0';
    integrationStorage.run('quality-supervisor/1.0.0', () => {
      expect(getIntegration()).toBe('quality-supervisor/1.0.0');
    });
  });

  it('ignores a whitespace-only env var', () => {
    process.env.QASE_MCP_INTEGRATION = '   ';
    expect(getIntegration()).toBeUndefined();
  });

  it('keeps concurrent scopes isolated from each other', async () => {
    const observe = (marker: string, delayMs: number) =>
      integrationStorage.run(marker, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return getIntegration();
      });

    // Interleaved on purpose: the first scope resumes after the second has run.
    const [first, second] = await Promise.all([
      observe('quality-supervisor/1.0.0', 20),
      observe('quality-supervisor/2.0.0', 0),
    ]);

    expect(first).toBe('quality-supervisor/1.0.0');
    expect(second).toBe('quality-supervisor/2.0.0');
  });
});
