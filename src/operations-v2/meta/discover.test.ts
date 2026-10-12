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
  return handler(args) as Promise<{
    found: number;
    tools: { name: string; destructive: boolean }[];
  }>;
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

/**
 * The category filter reads the registered definitions, not the wire shape.
 *
 * `destructiveHint: true` is the spec's own default, so the wire projection
 * drops it — and when this filter read that shape, `category: "delete"`
 * matched nothing and every deletion came back flagged `destructive: false`,
 * which is the opposite of what the flag is for.
 */
describe('qase_discover_tools — categories', () => {
  beforeEach(() => {
    for (const [name, annotations] of [
      ['probe_destructive_tool', { readOnlyHint: false, destructiveHint: true }],
      ['probe_readonly_tool', { readOnlyHint: true, destructiveHint: false }],
      ['probe_write_tool', { readOnlyHint: false, destructiveHint: false }],
    ] as const) {
      toolRegistry.unregister(name);
      toolRegistry.register({
        name,
        title: name,
        description: 'A probe tool for the category filter.',
        schema: z.object({}),
        handler: async () => ({}),
        annotations,
      });
    }
  });

  it('finds a destructive tool under "delete", and flags it', async () => {
    const result = await invoke({ category: 'delete' });

    const found = result.tools.find((t) => t.name === 'probe_destructive_tool');
    expect(found).toBeDefined();
    expect(found?.destructive).toBe(true);
  });

  it('flags a destructive tool in a plain search too', async () => {
    const result = await invoke({ query: 'probe tool for the category filter' });

    const byName = Object.fromEntries(result.tools.map((t) => [t.name, t.destructive]));
    expect(byName.probe_destructive_tool).toBe(true);
    expect(byName.probe_write_tool).toBe(false);
  });

  it('keeps a destructive tool out of read and write', async () => {
    const [read, write] = await Promise.all([
      invoke({ category: 'read' }),
      invoke({ category: 'write' }),
    ]);

    expect(read.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['probe_readonly_tool']),
    );
    expect(write.tools.map((t) => t.name)).toEqual(expect.arrayContaining(['probe_write_tool']));
    expect([...read.tools, ...write.tools].map((t) => t.name)).not.toContain(
      'probe_destructive_tool',
    );
  });

  it('searches the catalogue the client is given, whole', async () => {
    const result = await invoke({});

    expect(result.found).toBe(toolRegistry.getTools().length);
  });
});
