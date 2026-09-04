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
    'Create or update a single test case. With `id` it updates that case, without `id` it creates ' +
    'a new one. Enum fields (priority, severity, type, layer, behavior, automation) accept either ' +
    'a label such as "high" or "blocker" or the project\'s numeric ID — the server normalizes ' +
    'both. Steps can be classic action/expected pairs or Gherkin, and may reference shared steps ' +
    'by hash. Writing more than one case? Use qase_case_bulk_create instead: it takes a list and ' +
    'sends one request. If the project has "Test case review" enabled, direct writes may need to ' +
    'go through a review — run qase_discover_tools with "review" for those tools. Cost: one API ' +
    'call, about 0.6s to create and 0.4s to update. Ten sequential calls measured 5.6s against ' +
    '1.2s for one qase_case_bulk_create writing the same ten, so a loop is roughly four times ' +
    'slower.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_case_delete',
  description:
    'Delete a test case by project code and case ID. The case goes, and so does its execution ' +
    'history — every result recorded against it stops being reachable. This cannot be undone. ' +
    'Before deleting a case that has simply become obsolete, consider marking it deprecated ' +
    'through qase_case_upsert instead, which keeps the history intact. There is no bulk delete: ' +
    'removing many cases means one call each, and each one asks for confirmation. Deletion asks ' +
    'the user for confirmation and does not proceed without it. Cost: one API call, about 0.4s.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
  visibility: 'discoverable',
});
