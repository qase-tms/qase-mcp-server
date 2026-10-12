/**
 * Tests for qase_discover_tools.
 *
 * Tool handlers receive raw MCP arguments — the server does not run them
 * through the Zod schema — so schema defaults never materialise. The handler
 * has to apply them itself.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { z } from 'zod';
import { toolRegistry } from '../../utils/registry.js';

import './discover.js';

function invoke(args: Record<string, unknown>) {
  const handler = toolRegistry.getHandler('qase_discover_tools')!;
  return handler(args) as Promise<{ found: number; tools: { name: string }[] }>;
}

beforeEach(() => {
  toolRegistry.unregister('probe_secondary_tool');
  toolRegistry.register({
    name: 'probe_secondary_tool',
    title: 'Probe secondary tool',
    description: 'A probe tool used to verify discovery activation.',
    schema: z.object({}),
    handler: async () => ({}),
  });
});

describe('qase_discover_tools — search', () => {
  it('returns the matching tools, every one of them already listed', async () => {
    const result = await invoke({ query: 'probe tool used to verify' });

    expect(result.found).toBeGreaterThanOrEqual(1);
    expect(result.tools.map((t) => t.name)).toContain('probe_secondary_tool');
    // Nothing is hidden any more, so a match is callable without a further step.
    expect(toolRegistry.getTools().map((t) => t.name)).toContain('probe_secondary_tool');
    expect(result).not.toHaveProperty('activated');
  });

  it('finds nothing for a query no tool matches', async () => {
    const result = await invoke({ query: 'zzz-no-such-tool-zzz' });

    expect(result.found).toBe(0);
    expect(result.tools).toEqual([]);
  });
});
