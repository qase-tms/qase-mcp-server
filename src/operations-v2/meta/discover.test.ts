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
import { getActivationStore } from '../../tools/activation.js';
import { requestSubjectStorage } from '../../utils/auth-context.js';

import './discover.js';

let testCounter = 0;

/**
 * Run the handler under a fresh, unique subject. Activation lives in the
 * shared, process-wide store returned by `getActivationStore()` now rather
 * than on the registry, so a subject reused across tests would leak
 * activation state between them —
 * a new one per call keeps every test's activations isolated, the same
 * independence the old per-test `unregister`/`register` cycle gave for free
 * when activation was still the registry's own state.
 */
function invoke(args: Record<string, unknown>) {
  const handler = toolRegistry.getHandler('qase_discover_tools')!;
  const subject = `test-subject-${++testCounter}`;
  return requestSubjectStorage.run(subject, () =>
    (
      handler(args) as Promise<{ found: number; activated: number; tools: { name: string }[] }>
    ).then(async (result) => ({
      ...result,
      activeNames: Array.from(await getActivationStore().get(subject)),
    })),
  );
}

beforeEach(() => {
  toolRegistry.unregister('probe_secondary_tool');
  toolRegistry.register({
    name: 'probe_secondary_tool',
    title: 'Probe secondary tool',
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
    // Activation now lives in the store, keyed by caller subject, not on the
    // registry — getTools() only shows it once that active set is passed in.
    expect(result.activeNames).toContain('probe_secondary_tool');
    expect(toolRegistry.getTools(new Set(result.activeNames)).map((t) => t.name)).toContain(
      'probe_secondary_tool',
    );
  });

  it('does not activate anything when `activate` is false', async () => {
    const result = await invoke({ query: 'probe tool used to verify', activate: false });

    expect(result.found).toBe(1);
    expect(result.activated).toBe(0);
    expect(result.activeNames).not.toContain('probe_secondary_tool');
  });
});
