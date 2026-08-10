/**
 * Shared test case field definitions.
 *
 * `qase_case_upsert` and `qase_case_bulk_create` accept the same case body, so
 * the schema and the automation mapping live here instead of being duplicated
 * — a new case field only has to be added once.
 */

import { z } from 'zod';

const stepFields = {
  action: z.string().optional().describe('Step action (classic steps)'),
  expected_result: z.string().optional().describe('Expected result'),
  data: z.string().optional().describe('Test data'),
  value: z.string().optional().describe('Gherkin scenario text (when steps_type is "gherkin")'),
  attachments: z.array(z.string()).optional().describe('Attachment hashes'),
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
  attachments: z.array(z.string()).optional(),
  custom_field: z.record(z.any()).optional(),
});

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
