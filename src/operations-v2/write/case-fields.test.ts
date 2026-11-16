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
import { normalizeParameters } from './case-fields.js';

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

describe('case parameters', () => {
  it('is declared on every tool that writes a case body', () => {
    for (const tool of TOOLS_WITH_STEPS) {
      expect(JSON.stringify(schemaOf(tool))).toContain('"parameters"');
    }
  });

  it('states that sending the list replaces it', () => {
    const description = schemaOf('qase_case_upsert').properties.parameters.description;
    expect(description).toMatch(/Replaces the whole list/);
  });
});

describe('normalizeParameters', () => {
  const single = { title: 'browser', values: ['chrome', 'firefox'] };
  const group = {
    items: [
      { title: 'os', values: ['mac'] },
      { title: 'arch', values: ['arm'] },
    ],
  };

  it('leaves the shapes the API accepts as they are', () => {
    expect(normalizeParameters([single, group, { shared_id: 'sp-1' }])).toEqual([
      single,
      group,
      { shared_id: 'sp-1' },
    ]);
  });

  it('unwraps a single parameter copied from a case read', () => {
    // Sent as read, the API rejects it with a bare "Data is invalid.".
    expect(normalizeParameters([{ type: 'single', item: single }])).toEqual([single]);
  });

  it('drops the read-side type from a group', () => {
    expect(normalizeParameters([{ type: 'group', ...group }])).toEqual([group]);
  });

  it('writes a shared parameter read back with its contents as the reference only', () => {
    expect(normalizeParameters([{ shared_id: 'sp-1', type: 'single', item: single }])).toEqual([
      { shared_id: 'sp-1' },
    ]);
  });

  it('keeps an empty list, which clears the parameters', () => {
    expect(normalizeParameters([])).toEqual([]);
  });

  it('passes anything that is not a list through for the API to reject', () => {
    expect(normalizeParameters('oops')).toBe('oops');
  });
});
