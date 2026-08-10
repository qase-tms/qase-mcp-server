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
  return handler(args) as Promise<{ found: number; activated: number; tools: { name: string }[] }>;
}

beforeEach(() => {
  toolRegistry.unregister('probe_secondary_tool');
  toolRegistry.register({
    name: 'probe_secondary_tool',
    description: 'A probe tool used to verify discovery activation.',
    schema: z.object({}),
    handler: async () => ({}),
    visibility: 'discoverable',
  });
});

describe('qase_discover_tools — activation', () => {
  it('activates matched tools when `activate` is omitted', async () => {
    expect(toolRegistry.getTools().map((t) => t.name)).not.toContain('probe_secondary_tool');

    const result = await invoke({ query: 'probe tool used to verify' });

    expect(result.tools.map((t) => t.name)).toContain('probe_secondary_tool');
    expect(result.activated).toBe(1);
    expect(toolRegistry.getTools().map((t) => t.name)).toContain('probe_secondary_tool');
  });

  it('does not activate anything when `activate` is false', async () => {
    const result = await invoke({ query: 'probe tool used to verify', activate: false });

    expect(result.found).toBe(1);
    expect(result.activated).toBe(0);
    expect(toolRegistry.getTools().map((t) => t.name)).not.toContain('probe_secondary_tool');
  });
});
