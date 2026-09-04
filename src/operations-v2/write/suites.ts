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
    'Create or update a test suite — the folder cases live in. Without `id` it creates, with `id` ' +
    'it updates. Nest a suite by passing `parent_id`; the whole existing tree comes back from ' +
    'qase_project_context, so read that first rather than guessing at parent IDs. Building a deep ' +
    'tree means one call per node, so create parents before children and reuse the IDs returned. ' +
    'Cost: one API call, about 0.5s.',
  schema: UpsertSchema,
  handler: upsert,
  annotations: CreateAnnotation,
  visibility: 'discoverable',
});

toolRegistry.register({
  name: 'qase_suite_delete',
  description:
    'Delete a test suite by project code and suite ID. By default the cases inside it are not ' +
    'deleted — they move up to the parent suite. Pass `delete_cases: true` to remove them along ' +
    'with the suite, which also removes their history and cannot be undone. Deleting a suite with ' +
    'children deletes the whole subtree, so check the tree in qase_project_context before ' +
    'calling. Deletion asks the user for confirmation and does not proceed without it. Cost: one ' +
    'API call, about 0.4s, longer for a large subtree.',
  schema: DeleteSchema,
  handler: del,
  annotations: DeleteAnnotation,
  visibility: 'discoverable',
});
