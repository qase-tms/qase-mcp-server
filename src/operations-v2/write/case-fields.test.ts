/**
 * The emitted shape of the shared case schema.
 *
 * Tool schemas are inlined — the registry builds them with
 * `$refStrategy: 'none'` — so a recursive field repeats its whole definition at
 * every nesting level, prose included. Every byte of that is sent to the model
 * on every single request, which is why the nested level is deliberately
 * terse: the reader already met those fields one level up.
 */

import { describe, it, expect } from '@jest/globals';
import { toolRegistry } from '../../utils/registry.js';
import '../index.js';

type Schema = Record<string, any>;

function stepLevels(tool: string): { top: Schema; nested: Schema } {
  const schema = toolRegistry.getTool(tool)!.inputSchema as Schema;
  const top = schema.properties.steps.items;
  return { top, nested: top.properties.steps.items };
}

describe('the shared case schema', () => {
  it('documents the step fields at the level the model first meets them', () => {
    const { top } = stepLevels('qase_case_upsert');

    expect(top.properties.action.description).toBeTruthy();
    expect(top.properties.expected_result.description).toBeTruthy();
  });

  it('does not repeat that prose in nested substeps', () => {
    const { nested } = stepLevels('qase_case_upsert');

    // Same fields — the structure a caller needs to build the request is intact…
    expect(Object.keys(nested.properties).sort()).toEqual(
      expect.arrayContaining(['action', 'attachments', 'data', 'expected_result', 'shared']),
    );
    // …but none of them carries a second copy of the description.
    const described = Object.entries(nested.properties as Record<string, Schema>)
      .filter(([, v]) => typeof v.description === 'string')
      .map(([k]) => k);
    expect(described).toEqual([]);
  });

  it('keeps the nested level materially smaller than the top one', () => {
    const { top, nested } = stepLevels('qase_case_upsert');

    expect(JSON.stringify(nested).length).toBeLessThan(JSON.stringify(top).length / 2);
  });
});
