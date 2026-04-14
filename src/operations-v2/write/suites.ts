import { z } from 'zod';
import { getApiClient } from '../../client/index.js';
import { toolRegistry, CreateAnnotation, DeleteAnnotation } from '../../utils/registry.js';
import { toResultAsync, createToolError } from '../../utils/errors.js';
import { ProjectCodeSchema, IdSchema } from '../../utils/validation.js';

const UpsertSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema.optional().describe('Suite ID — if provided, updates; if omitted, creates'),
  title: z.string().min(1).max(255).describe('Suite title'),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  parent_id: z.number().int().positive().optional().describe('Parent suite ID for nesting'),
});

const DeleteSchema = z.object({
  code: ProjectCodeSchema,
  id: IdSchema,
  delete_cases: z
    .boolean()
    .optional()
    .describe('If true, delete all cases in suite; if false, move to parent'),
});

async function upsert(args: z.infer<typeof UpsertSchema>) {
  const client = getApiClient();
  const { code, id, ...data } = args;

  if (id) {
    const result = await toResultAsync(client.suites.updateSuite(code, id, data as any));
    return result.match(
      () => ({ success: true, id }),
      (e) => {
        throw createToolError(e, 'suite operation');
      },
    );
  }

  const result = await toResultAsync(client.suites.createSuite(code, data as any));
  return result.match(
    (r) => r.data.result,
    (e) => {
      throw createToolError(e, 'suite operation');
    },
  );
}

async function del(args: z.infer<typeof DeleteSchema>) {
  const client = getApiClient();
  const { code, id, delete_cases } = args;
  const suiteDelete = delete_cases !== undefined ? { after_delete_case: delete_cases } : undefined;
  const result = await toResultAsync(client.suites.deleteSuite(code, id, suiteDelete as any));
  return result.match(
    () => ({ success: true, id }),
    (e) => {
      throw createToolError(e, 'suite operation');
    },
  );
}

toolRegistry.register({
  name: 'qase_suite_upsert',
  description:
    'Create or update a test suite. If `id` is provided, updates the existing suite; ' +
    'if omitted, creates a new one.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
});

toolRegistry.register({
  name: 'qase_suite_delete',
  description:
    'Delete a test suite. If `delete_cases` is true, removes all cases in the suite; ' +
    'if false or omitted, cases are moved to the parent suite.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
});
