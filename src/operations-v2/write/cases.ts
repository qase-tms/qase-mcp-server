import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';
import { normalizeCaseEnums } from '../../utils/case-enums.js';

const TestStepSchema = z.object({
  action: z.string().optional().describe('Step action (classic steps)'),
  expected_result: z.string().optional().describe('Expected result'),
  data: z.string().optional().describe('Test data'),
  value: z.string().optional().describe('Gherkin scenario text (when steps_type is "gherkin")'),
  attachments: z.array(z.string()).optional().describe('Attachment hashes'),
});

const CaseFieldsSchema = z.object({
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
  automation: z.string().optional(),
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

const UpsertSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.optional().describe(
    'Case ID — if provided, updates the case; if omitted, creates a new one',
  ),
  ...CaseFieldsSchema.shape,
});

const DeleteSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
});

async function upsert(args: z.infer<typeof UpsertSchema>) {
  const client = getApiClient();
  const { code, id, ...data } = args;
  const normalized = await normalizeCaseEnums(data);

  const result = await toResultAsync(
    id
      ? client.cases.updateCase(code, id, normalized as any)
      : client.cases.createCase(code, normalized as any),
  );

  return result.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'case operation');
    },
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const result = await toResultAsync(client.cases.deleteCase(args.code, args.id));
  return result.match(
    () => ({ success: true, id: args.id }),
    (e) => {
      throw createToolError(e, 'case operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_case_upsert',
  description:
    'Create or update a test case. If `id` is provided, updates the existing case; ' +
    'if omitted, creates a new one. Enum fields (priority, severity, type, etc.) accept ' +
    'both labels ("high", "blocker") and numeric IDs — the server normalizes automatically.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_case_delete',
  description: 'Delete a test case by project code and case ID.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
});
