/**
 * The emitted shape of the shared case schema.
 *
 * The step tree refers to itself, so it is emitted once into `$defs` and
 * pointed at from everywhere it appears. That is what keeps a recursive
 * structure from costing a copy of itself at every level — and every byte of
 * a tool schema is sent to the model on every single request.
 */

import { describe, it, expect } from '@jest/globals';
import { toolRegistry } from '../../utils/registry.js';
import '../index.js';

type Schema = Record<string, any>;

/** Every tool whose arguments carry a case body, and so the step tree. */
const TOOLS_WITH_STEPS = [
  'qase_case_upsert',
  'qase_case_bulk_create',
  'qase_review_create',
  'qase_review_update',
  'qase_review_bulk_create',
];

const schemaOf = (tool: string) => toolRegistry.getTool(tool)!.inputSchema as Schema;

describe('the shared case schema', () => {
  it('documents the step fields once, in $defs', () => {
    const step = schemaOf('qase_case_upsert').$defs?.step;

    expect(step).toBeDefined();
    expect(step.properties.action.description).toBeTruthy();
    expect(step.properties.expected_result.description).toBeTruthy();
  });

  it('reaches substeps by reference, so the definition is never copied', () => {
    const schema = schemaOf('qase_case_upsert');

    // The case points at the definition…
    expect(schema.properties.steps.items).toEqual({ $ref: '#/$defs/step' });
    // …and so does the step's own `steps`, which is what makes it recursive:
    // a sub-sub-step has the same schema, to any depth.
    expect(schema.$defs.step.properties.steps.items).toEqual({ $ref: '#/$defs/step' });
  });

  it('spells the step fields exactly once per schema', () => {
    for (const tool of TOOLS_WITH_STEPS) {
      const serialised = JSON.stringify(schemaOf(tool));
      const copies = serialised.split('"expected_result"').length - 1;

      expect({ tool, copies }).toEqual({ tool, copies: 1 });
    }
  });

  it('keeps every $ref pointing at a definition that exists', () => {
    for (const tool of toolRegistry.getDefinitions()) {
      const schema = JSON.stringify(tool.inputSchema);
      const defs = Object.keys((tool.inputSchema as Schema).$defs ?? {});

      for (const [, name] of schema.matchAll(/"\$ref":"#\/\$defs\/([^"]+)"/g)) {
        expect({ tool: tool.name, name, known: defs.includes(name) }).toEqual({
          tool: tool.name,
          name,
          known: true,
        });
      }
    }
  });
});
