/**
 * Shared test case field definitions.
 *
 * `qase_case_upsert` and `qase_case_bulk_create` accept the same case body, so
 * the schema and the automation mapping live here instead of being duplicated
 * — a new case field only has to be added once.
 */

import { z } from 'zod';
import { coerceFlakyBoolean } from '../../utils/case-enums.js';

const stepFields = {
  action: z
    .string()
    .optional()
    .describe('Step action (classic steps). Not needed when `shared` is set.'),
  expected_result: z.string().optional().describe('Expected result'),
  data: z.string().optional().describe('Test data'),
  value: z.string().optional().describe('Gherkin scenario text (when steps_type is "gherkin")'),
  attachments: z.array(z.string()).optional().describe('Hashes from qase_attachment_upload'),
  shared: z
    .string()
    .optional()
    .describe('Hash from `qase_shared_step_upsert` to reuse here; then `action` is not needed.'),
  shared_step_hash: z
    .string()
    .optional()
    .describe('Alias for `shared`, the spelling a case reads back.'),
};

/**
 * A step as the caller writes it.
 *
 * TypeScript cannot infer the type of a schema that refers to itself, so the
 * shape is stated once here and the schema is annotated with it.
 */
export interface TestStep {
  action?: string;
  expected_result?: string;
  data?: string;
  value?: string;
  attachments?: string[];
  shared?: string;
  shared_step_hash?: string;
  steps?: TestStep[];
}

export const TestStepSchema: z.ZodType<TestStep> = z.object({
  ...stepFields,
  /**
   * The step tree is recursive, and a getter is how zod expresses that: the
   * property resolves when the schema is first walked, by which point
   * `TestStepSchema` exists.
   *
   * This is also what lets the emitted JSON Schema carry the step definition
   * ONCE, in `$defs`, with both levels pointing at it. The shape this replaces
   * could not recurse at all — it spelled a second, deliberately terse copy of
   * the fields by hand and stopped there, so a sub-sub-step had no schema.
   */
  get steps() {
    return z
      .array(TestStepSchema)
      .optional()
      .describe('Nested substeps, nesting further if needed.');
  },
});

// Name the definition the step tree is hoisted into. Without this zod calls it
// `__schema0`, which is what the model would read in `$defs`.
z.globalRegistry.add(TestStepSchema, { id: 'step' });

export const CaseFieldsSchema = z.object({
  title: z.string().min(1).max(255).describe('Test case title'),
  description: z.string().optional().describe('Free-form description of what the case covers'),
  preconditions: z.string().optional().describe('State the system must be in before the steps run'),
  postconditions: z.string().optional().describe('State to restore or verify after the steps run'),
  severity: z.string().optional().describe('Severity label or numeric ID'),
  priority: z
    .string()
    .optional()
    .describe('Priority label or numeric ID (0=not set, 1=high, 2=medium, 3=low)'),
  type: z.string().optional().describe('Type label or numeric ID'),
  layer: z.string().optional().describe('Layer label or numeric ID'),
  behavior: z.string().optional().describe('Behavior label or numeric ID'),
  automation: z
    .string()
    .optional()
    .describe('Automation: 0=Manual, 1=To be automated, 2=Automated (label or ID)'),
  status: z.string().optional().describe('Status label or numeric ID'),
  // Declared as a string like the other dictionary fields, with a boolean
  // folded in first: the name invites `true`, which the API rejects outright.
  is_flaky: z.preprocess(
    coerceFlakyBoolean,
    z.string().optional().describe('Is flaky: 0=No, 1=Yes; a boolean works too.'),
  ),
  suite_id: z.number().int().positive().optional().describe('ID of the suite that holds the case'),
  milestone_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('ID of the milestone the case belongs to'),
  steps: z
    .array(TestStepSchema)
    .optional()
    .describe('Ordered test steps; omit for a case without steps'),
  steps_type: z
    .enum(['classic', 'gherkin'])
    .optional()
    .describe('Step style: "classic" action/expected, or "gherkin" scenario text'),
  tags: z.array(z.string()).optional().describe('Tag names, e.g. ["smoke", "billing"]'),
  attachments: z.array(z.string()).optional().describe('Hashes from qase_attachment_upload'),
  custom_field: z
    .record(z.string(), z.any())
    .optional()
    .describe('Custom fields by ID, e.g. { "12": "value" }'),
});

/**
 * Rewrite `shared_step_hash` to `shared` throughout a step tree.
 *
 * The API links a step to a shared step through `shared`, but reports the same
 * link back as `shared_step_hash` — so that is the name callers reach for after
 * reading a case, and sending it produces a confusing "Action field is
 * required". Accept both spellings and send the one the API understands.
 */
export function resolveSharedStepRefs(steps: unknown): unknown {
  if (!Array.isArray(steps)) return steps;

  return steps.map((step) => {
    if (typeof step !== 'object' || step === null) return step;

    const { shared_step_hash: alias, ...rest } = step as Record<string, unknown>;
    const resolved: Record<string, unknown> = rest;

    if (alias !== undefined && resolved.shared === undefined) {
      resolved.shared = alias;
    }

    if (resolved.steps !== undefined) {
      resolved.steps = resolveSharedStepRefs(resolved.steps);
    }

    return resolved;
  });
}

/**
 * Map the user-facing `automation` enum (0=Manual, 1=To be automated,
 * 2=Automated) to the current API contract (`isManual` + `isToBeAutomated`).
 * The legacy `automation` field is deprecated in qase-api-client and dropped
 * from the outbound payload.
 */
export function applyAutomationMapping(caseData: Record<string, unknown>): Record<string, unknown> {
  const automationId = caseData.automation;

  if (typeof automationId !== 'number') {
    return caseData;
  }

  const { automation: _drop, ...rest } = caseData;
  const mapped: Record<string, unknown> = rest;

  switch (automationId) {
    case 2: // Automated
      mapped.isManual = 0;
      break;
    case 1: // To be automated
      mapped.isManual = 1;
      mapped.isToBeAutomated = 1;
      break;
    case 0: // Manual
    default:
      mapped.isManual = 1;
      mapped.isToBeAutomated = 0;
      break;
  }

  return mapped;
}
