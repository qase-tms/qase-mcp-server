/**
 * What the tool list looks like ON THE WIRE, as opposed to what the registry
 * stores. Every byte of `tools/list` goes to the model on every request, so
 * the wire projection drops what a client gains nothing from reading:
 *
 *  - annotation hints equal to the spec's defaults (readOnlyHint=false,
 *    destructiveHint=true, idempotentHint=false, openWorldHint=true), except
 *    readOnlyHint, destructiveHint and openWorldHint, which the OpenAI plugin
 *    directory requires stated on every tool;
 *  - `outputSchema`, which no client validates against and which only ever
 *    served as the switch for attaching `structuredContent`.
 *
 * The stored definition keeps everything — handlers and tests read it.
 */

import { describe, it, expect } from '@jest/globals';
import { toolRegistry, CreateAnnotation } from './registry.js';
import '../operations-v2/index.js';

const wire = (name: string) => toolRegistry.getTools().find((t) => t.name === name)!;

describe('the wire projection of a tool', () => {
  it('states readOnlyHint, destructiveHint and openWorldHint on every tool', () => {
    for (const t of toolRegistry.getTools()) {
      expect(typeof t.annotations?.readOnlyHint).toBe('boolean');
      expect(typeof t.annotations?.destructiveHint).toBe('boolean');
      expect(typeof t.annotations?.openWorldHint).toBe('boolean');
    }
    const del = wire('qase_case_delete');
    expect(del.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    });
  });

  it('still omits idempotentHint when it equals the default', () => {
    expect(wire('qase_case_delete').annotations?.idempotentHint).toBe(true);
    expect(CreateAnnotation.idempotentHint).toBe(false);
    expect(wire('qase_case_upsert').annotations).not.toHaveProperty('idempotentHint');
  });

  it('marks only qase_api as reaching beyond the workspace', () => {
    const open = toolRegistry.getTools().filter((t) => t.annotations?.openWorldHint);
    expect(open.map((t) => t.name)).toEqual(['qase_api']);
  });

  it('keeps a hint that departs from the default, so a non-destructive write is still marked', () => {
    const create = wire('qase_case_upsert');
    expect(create.annotations?.destructiveHint).toBe(false);
    expect(CreateAnnotation.destructiveHint).toBe(false);
  });

  it('leaves the stored definition intact', () => {
    expect(toolRegistry.getTool('qase_case_delete')?.annotations?.destructiveHint).toBe(true);
  });

  it('does not carry an outputSchema', () => {
    for (const t of toolRegistry.getTools()) expect(t).not.toHaveProperty('outputSchema');
  });

  it('marks the same tools destructive on the wire as in the stored definitions', () => {
    const names = (tools: { name: string; annotations?: { destructiveHint?: boolean } }[]) =>
      tools.filter((t) => t.annotations?.destructiveHint).map((t) => t.name);

    expect(names(toolRegistry.getDefinitions()).length).toBeGreaterThan(5);
    expect(names(toolRegistry.getTools())).toEqual(names(toolRegistry.getDefinitions()));
  });
});
