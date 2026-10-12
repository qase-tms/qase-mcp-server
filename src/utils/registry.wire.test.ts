/**
 * What the tool list looks like ON THE WIRE, as opposed to what the registry
 * stores. Every byte of `tools/list` goes to the model on every request, so
 * the wire projection drops what a client gains nothing from reading:
 *
 *  - annotation hints equal to the spec's defaults (readOnlyHint=false,
 *    destructiveHint=true, idempotentHint=false, openWorldHint=true);
 *  - `outputSchema`, which no client validates against and which only ever
 *    served as the switch for attaching `structuredContent`.
 *
 * The stored definition keeps everything — handlers and tests read it.
 */

import { describe, it, expect } from '@jest/globals';
import { toolRegistry, DeleteAnnotation, CreateAnnotation } from './registry.js';
import '../operations-v2/index.js';

const wire = (name: string) => toolRegistry.getTools(new Set([name])).find((t) => t.name === name)!;

describe('the wire projection of a tool', () => {
  it('omits annotation hints that equal the spec defaults', () => {
    const del = wire('qase_case_delete');
    // destructiveHint=true and openWorldHint=true ARE the defaults — gone.
    expect(del.annotations).not.toHaveProperty('destructiveHint');
    expect(del.annotations).not.toHaveProperty('openWorldHint');
    // readOnlyHint=false is the default too; idempotentHint=true is not.
    expect(del.annotations).not.toHaveProperty('readOnlyHint');
    expect(del.annotations?.idempotentHint).toBe(true);
    expect(DeleteAnnotation.destructiveHint).toBe(true);
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
    for (const t of toolRegistry.getAllTools()) expect(t).not.toHaveProperty('outputSchema');
  });
});
