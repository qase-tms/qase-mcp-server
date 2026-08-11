import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';
import { normalizeCaseEnums } from '../../utils/case-enums.js';
import { CaseFieldsSchema, applyAutomationMapping, resolveSharedStepRefs } from './case-fields.js';

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
  const normalized = applyAutomationMapping(await normalizeCaseEnums(data));

  if (normalized.steps !== undefined) {
    normalized.steps = resolveSharedStepRefs(normalized.steps);
  }

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
  visibility: 'discoverable',
});
