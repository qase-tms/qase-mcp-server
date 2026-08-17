/**
 * Shared test case field definitions.
 *
 * `qase_case_upsert` and `qase_case_bulk_create` accept the same case body, so
 * the schema and the automation mapping live here instead of being duplicated
 * — a new case field only has to be added once.
 */

import { z } from 'zod';

const stepFields = {
  action: z
    .string()
    .optional()
    .describe('Step action (classic steps). Not needed when `shared` is set.'),
  expected_result: z.string().optional().describe('Expected result'),
  data: z.string().optional().describe('Test data'),
  value: z.string().optional().describe('Gherkin scenario text (when steps_type is "gherkin")'),
  attachments: z
    .array(z.string())
    .optional()
    .describe('Attachment hashes from qase_attachment_upload'),
  shared: z
    .string()
    .optional()
    .describe(
      'Hash of an existing shared step to insert at this position, from `qase_shared_step_upsert`. ' +
        'The step then reuses that shared step instead of defining its own content, so `action` ' +
        'can be omitted. Reading the case back reports the link as `shared_step_hash`.',
    ),
  shared_step_hash: z
    .string()
    .optional()
    .describe(
      'Alias for `shared` — the name used when reading a case. Sent to the API as `shared`.',
    ),
};

export const TestStepSchema = z.object({
  ...stepFields,
  steps: z
    .array(z.object(stepFields).passthrough())
    .optional()
    .describe('Nested substeps. Same structure as parent steps, supports further nesting.'),
});

export const CaseFieldsSchema = z.object({
  title: z.string().min(1).max(255).describe('Test case title'),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  postconditions: z.string().optional(),
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
    .describe(
      'Automation status (label, slug, or numeric ID: 0=Manual / is-not-automated, 1=To be automated, 2=Automated)',
    ),
  status: z.string().optional().describe('Status label or numeric ID'),
  is_flaky: z.boolean().optional(),
  suite_id: z.number().int().positive().optional(),
  milestone_id: z.number().int().positive().optional(),
  steps: z.array(TestStepSchema).optional(),
  steps_type: z.enum(['classic', 'gherkin']).optional(),
  tags: z.array(z.string()).optional(),
  attachments: z
    .array(z.string())
    .optional()
    .describe('Attachment hashes from qase_attachment_upload'),
  custom_field: z.record(z.any()).optional(),
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
